using System.Text.Json;
using Microsoft.Extensions.Primitives;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed partial class Api
{
    static string QueryOption(JsonElement filters, string key, string fallback) => filters.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : fallback;
    static string QueryClauses(JsonElement filters, string key) => filters.TryGetProperty(key, out var v) ? v.ValueKind == JsonValueKind.String ? v.GetString()! : v.GetRawText() : "{\"group\":\"AND\",\"rules\":[]}";
    void ValidateAdvancedQuery(JsonElement filters, Row me)
    {
        Check(!new[] { "flat", "tree", "links" }.Contains(QueryOption(filters, "query_type", "flat")), 400, "查询类型无效");
        Check(!new[] { "related", "dependency", "duplicate", "parent", "all" }.Contains(QueryOption(filters, "link_kind", "related")), 400, "链接类型无效");
        Check(!new[] { "forward", "reverse", "both" }.Contains(QueryOption(filters, "link_direction", "both")), 400, "链接方向无效");
        Check(!new[] { "must", "may", "not" }.Contains(QueryOption(filters, "link_mode", "must")), 400, "链接匹配模式无效");
        if (filters.TryGetProperty("target_clauses", out _)) AddClauses(QueryClauses(filters, "target_clauses"), me, [], []);
        if (filters.TryGetProperty("project_ids", out var ids)) Check(ids.ValueKind != JsonValueKind.Array || ids.GetArrayLength() > 50 || ids.EnumerateArray().Any(v => v.ValueKind != JsonValueKind.Number || !v.TryGetInt64(out var id) || id <= 0), 400, "项目范围无效，最多选择 50 个项目");
    }
    long[] QueryProjects(Row me, long project, JsonElement filters)
    {
        var across = filters.TryGetProperty("across_projects", out var a) && (a.ValueKind == JsonValueKind.True || a.ValueKind == JsonValueKind.String && a.GetString() == "true");
        if (!across) return [project];
        var accessible = db.All("SELECT p.id FROM projects p WHERE @p0=1 OR EXISTS(SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=@p1)", me["admin"], me["id"]).Select(p => N(p, "id")).ToHashSet();
        if (!filters.TryGetProperty("project_ids", out var selected) || selected.GetArrayLength() == 0) return accessible.ToArray();
        var requested = selected.EnumerateArray().Select(v => v.GetInt64()).Distinct().ToArray();
        Check(requested.Any(id => !accessible.Contains(id)), 404, "所选项目不存在或无权访问"); return requested;
    }
    object ExecuteQuery(Row me, long project, string filtersJson)
    {
        ValidateFilters(filtersJson, me);
        using var doc = JsonDocument.Parse(filtersJson); var filters = doc.RootElement;
        var projects = QueryProjects(me, project, filters); var type = QueryOption(filters, "query_type", "flat");
        if (type == "flat")
        {
            var fields = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(filtersJson)!;
            return List(me, project, new QueryCollection(fields.ToDictionary(k => k.Key, v => new StringValues(v.Value.ValueKind == JsonValueKind.String ? v.Value.GetString() : v.Value.GetRawText()))), projects);
        }
        var args = projects.Cast<object?>().ToList(); var scope = "i.deleted=0 AND i.project_id IN (" + string.Join(',', args.Select((_, i) => "@p" + i)) + ")";
        Check(N(db.One("SELECT COUNT(*) n FROM items i WHERE " + scope, args.ToArray())!, "n") > 5000, 400, "树形和关联查询最多处理 5000 个工作项，请缩小项目范围");
        var all = db.All("SELECT i.*,p.name project_name,u.name assignee_name FROM items i JOIN projects p ON p.id=i.project_id LEFT JOIN users u ON u.id=i.assignee_id WHERE " + scope + " ORDER BY i.backlog_rank,i.id", args.ToArray());
        var byId = all.ToDictionary(i => N(i, "id"));
        HashSet<long> Matching(string key)
        {
            var parameters = args.ToList(); var where = new List<string> { scope }; AddClauses(QueryClauses(filters, key), me, where, parameters);
            return db.All("SELECT i.id FROM items i WHERE " + string.Join(" AND ", where), parameters.ToArray()).Select(r => N(r, "id")).ToHashSet();
        }
        var sources = Matching("clauses"); var targets = Matching("target_clauses"); var resultRows = new List<Row>(); var relations = new List<Row>();
        void Row(long id, int depth, long? parent, string kind, bool context = false) => resultRows.Add(new() { ["id"] = id, ["depth"] = depth, ["source_id"] = parent, ["relation"] = kind, ["context"] = context });
        if (type == "tree")
        {
            var children = all.Where(i => i["parent_id"] != null).GroupBy(i => N(i, "parent_id")).ToDictionary(g => g.Key, g => g.Select(i => N(i, "id")).ToArray());
            bool HasSourceAncestor(Row item)
            {
                var seen = new HashSet<long>();
                while (item["parent_id"] != null && byId.TryGetValue(N(item, "parent_id"), out var parent))
                { var id = N(parent, "id"); if (!seen.Add(id)) break; if (sources.Contains(id)) return true; item = parent; }
                return false;
            }
            var roots = all.Where(i => sources.Contains(N(i, "id")) && !HasSourceAncestor(i));
            List<Row> Walk(long id, int depth, long? parent, HashSet<long> path)
            {
                Check(depth > 100 || !path.Add(id), 400, "工作项层级过深或存在循环");
                var nested = new List<Row>();
                foreach (var child in children.GetValueOrDefault(id) ?? []) nested.AddRange(Walk(child, depth + 1, id, path));
                path.Remove(id);
                if (depth != 0 && !targets.Contains(id) && nested.Count == 0) return [];
                nested.Insert(0, new() { ["id"] = id, ["depth"] = depth, ["source_id"] = parent, ["relation"] = depth == 0 ? "" : "Child", ["context"] = depth != 0 && !targets.Contains(id) }); return nested;
            }
            foreach (var root in roots) resultRows.AddRange(Walk(N(root, "id"), 0, null, []));
        }
        else
        {
            var kind = QueryOption(filters, "link_kind", "related"); var direction = QueryOption(filters, "link_direction", "both"); var mode = QueryOption(filters, "link_mode", "must");
            var edges = new HashSet<(long From, long To, string Kind)>();
            void Edge(long from, long to, string edgeKind)
            {
                if (!byId.ContainsKey(from) || !byId.ContainsKey(to) || kind != "all" && kind != edgeKind) return;
                if (direction != "reverse") edges.Add((from, to, edgeKind));
                if (direction != "forward") edges.Add((to, from, edgeKind));
            }
            foreach (var item in all) if (item["parent_id"] != null) Edge(N(item, "parent_id"), N(item, "id"), "parent");
            foreach (var link in db.All("SELECT l.source_id,l.target_id,l.kind FROM item_links l JOIN items i ON i.id=l.source_id WHERE l.target_id IS NOT NULL AND " + scope, args.ToArray())) Edge(N(link, "source_id"), N(link, "target_id"), S(link, "kind"));
            foreach (var item in all.Where(i => sources.Contains(N(i, "id"))))
            {
                var id = N(item, "id"); var matches = edges.Where(e => e.From == id && targets.Contains(e.To)).OrderBy(e => e.To).ToArray();
                if (mode == "must" && matches.Length == 0 || mode == "not" && matches.Length != 0) continue;
                Row(id, 0, null, "");
                if (mode == "not") continue;
                foreach (var edge in matches) { Row(edge.To, 1, id, edge.Kind); relations.Add(new() { ["source_id"] = id, ["target_id"] = edge.To, ["kind"] = edge.Kind }); }
                Check(resultRows.Count > 15000, 400, "关联结果过多，请缩小条件");
            }
        }
        var ids = resultRows.Select(r => N(r, "id")).ToHashSet();
        return new { query_type = type, items = all.Where(i => ids.Contains(N(i, "id"))), rows = resultRows, relations, total = ids.Count, row_count = resultRows.Count, limit = 5000, offset = 0 };
    }
}
