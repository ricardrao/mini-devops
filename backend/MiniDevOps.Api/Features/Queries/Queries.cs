using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Primitives;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed partial class Api
{
    List<Row> ProjectQueries(Row me, long project) => db.All("SELECT q.*,u.name owner_name,editor.name changed_by_name,(SELECT COUNT(*) FROM query_favorites f WHERE f.query_id=q.id AND f.user_id=@p1) favorite FROM queries q JOIN users u ON u.id=q.user_id LEFT JOIN users editor ON editor.id=q.changed_by WHERE q.project_id=@p0 AND (q.user_id=@p1 OR q.shared=1) ORDER BY q.folder,q.name", project, me["id"]);
    void AddClauses(string json, Row me, List<string> where, List<object?> args)
    {
        Check(json.Length > 16000, 400, "查询条件过长"); using var document = JsonDocument.Parse(json); var count = 0;
        string Parameter(object? value) { var name = "@p" + args.Count; args.Add(value); return name; }
        string Compile(JsonElement rule, int depth)
        {
            Check(depth > 5 || ++count > 60 || rule.ValueKind != JsonValueKind.Object, 400, "查询条件最多 60 项、5 层分组");
            if (rule.TryGetProperty("rules", out var rules))
            {
                var group = Text(rule, "group", 3); Check(group is not ("AND" or "OR") || rules.ValueKind != JsonValueKind.Array || rules.GetArrayLength() > 40, 400, "查询分组无效");
                var children = rules.EnumerateArray().Select(r => Compile(r, depth + 1)).ToArray(); return children.Length == 0 ? "1=1" : "(" + string.Join(" " + group + " ", children) + ")";
            }
            var field = Text(rule, "field", 40); var op = Text(rule, "op", 20); var value = Text(rule, "value", 1000, true);
            var numeric = new[] { "id", "project_id", "priority", "estimate", "remaining_work", "original_estimate", "completed_work", "assignee_id", "iteration_id", "parent_id", "created_by", "blocked", "severity" }.Contains(field);
            var date = new[] { "created", "changed", "target_date" }.Contains(field);
            Check(!numeric && !date && !new[] { "title", "type", "state", "area", "tags", "activity" }.Contains(field), 400, "查询字段不支持");
            var column = "i." + field;
            if (op is "empty" or "notEmpty") return op == "empty" ? $"({column} IS NULL OR CAST({column} AS CHAR)='')" : $"({column} IS NOT NULL AND CAST({column} AS CHAR)!='')";
            object Parse(string v)
            {
                if (v == "@Me") { Check(field is not ("assignee_id" or "created_by"), 400, "@Me 只用于人员字段"); return me["id"]!; }
                if (numeric) { Check(!decimal.TryParse(v, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var number), 400, "数字条件格式错误"); return number; }
                if (date)
                {
                    var match = Regex.Match(v, @"^@Today(?:([+-])(\d{1,4}))?$");
                    if (match.Success) { var offset = match.Groups[2].Success ? int.Parse(match.Groups[2].Value) * (match.Groups[1].Value == "-" ? -1 : 1) : 0; return DateTime.UtcNow.Date.AddDays(offset).ToString("yyyy-MM-dd"); }
                    Check(!DateOnly.TryParseExact(v, "yyyy-MM-dd", out _), 400, "日期条件使用 yyyy-MM-dd 或 @Today-7");
                }
                return v;
            }
            if (op is "in" or "notIn")
            {
                var list = value.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries); Check(list.Length is < 1 or > 30, 400, "In 条件需要 1–30 个分号分隔的值");
                return column + (op == "in" ? " IN (" : " NOT IN (") + string.Join(',', list.Select(v => Parameter(Parse(v)))) + ")";
            }
            if (op is "contains" or "notContains" or "under")
            {
                Check(numeric || date, 400, "该字段不支持文本操作符");
                var escaped = value.ToLowerInvariant().Replace("!", "!!").Replace("%", "!%").Replace("_", "!_");
                if (op == "under") { Check(field != "area", 400, "Under 仅适用于 Area Path"); return $"(LOWER({column})={Parameter(value.ToLowerInvariant())} OR LOWER({column}) LIKE {Parameter(escaped + "\\%")} ESCAPE '!')"; }
                return $"LOWER({column}) {(op == "notContains" ? "NOT LIKE" : "LIKE")} {Parameter("%" + escaped + "%")} ESCAPE '!'";
            }
            Check(!new[] { "=", "!=", ">", ">=", "<", "<=" }.Contains(op), 400, "查询操作符不支持");
            var comparison = date ? $"SUBSTR({column},1,10)" : column; return comparison + " " + op + " " + Parameter(Parse(value));
        }
        where.Add(Compile(document.RootElement, 0));
    }
    void ValidateFilters(string filters, Row me)
    {
        using var doc = JsonDocument.Parse(filters); Check(doc.RootElement.ValueKind != JsonValueKind.Object, 400, "查询格式错误");
        if (doc.RootElement.TryGetProperty("clauses", out var clauses)) AddClauses(clauses.ValueKind == JsonValueKind.String ? clauses.GetString()! : clauses.GetRawText(), me, [], []);
        ValidateAdvancedQuery(doc.RootElement, me);
    }
    object? QueryRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries); var method = ctx.Request.Method;
        if (p.Length < 4 || p[1] != "projects" || p[3] is not ("queries" or "query-folders" or "query-run")) return null;
        var project = Id(p[2]); Access(me, project);
        if (p.Length == 4 && p[3] == "query-run" && method == "POST")
        {
            var filterText = Text(body, "filters", 20000); ValidateFilters(filterText, me);
            return ExecuteQuery(me, project, filterText);
        }
        if (p[3] == "query-folders")
        {
            if (method == "GET") return db.All("SELECT f.*,u.name changed_by_name FROM query_folders f LEFT JOIN users u ON u.id=f.changed_by WHERE f.project_id=@p0 AND (f.shared=1 OR f.user_id=@p1) ORDER BY f.name", project, me["id"]);
            if (p.Length == 4 && method == "POST")
            {
                var shared = Number(body, "shared", 0, 1); if (shared == 1) Access(me, project, true); var name = Text(body, "name", 200);
                Check(name.Split('/').Any(s => string.IsNullOrWhiteSpace(s) || s is "." or ".."), 400, "文件夹路径无效");
                Check(db.One("SELECT id FROM query_folders WHERE project_id=@p0 AND name=@p1 AND shared=@p2 AND (shared=1 OR user_id=@p3)", project, name, shared, me["id"]) != null, 409, "文件夹已存在");
                return new { id = db.Insert("INSERT INTO query_folders(project_id,user_id,name,shared,changed_by,changed) VALUES(@p0,@p1,@p2,@p3,@p1,@p4)", project, me["id"], name, shared, DateTime.UtcNow.ToString("O")) };
            }
            if (p.Length == 5 && method == "DELETE")
            {
                var folder = db.One("SELECT * FROM query_folders WHERE id=@p0 AND project_id=@p1", Id(p[4]), project); Check(folder == null || N(folder, "user_id") != N(me, "id") && N(me, "admin") != 1, 404, "文件夹不存在或无权修改");
                if (N(folder!, "shared") == 1) Access(me, project, true);
                Check(db.One("SELECT id FROM queries WHERE project_id=@p0 AND folder=@p1 AND shared=@p2 AND (shared=1 OR user_id=@p3)", project, folder!["name"], folder["shared"], folder["user_id"]) != null, 409, "请先移动或删除文件夹内的查询");
                db.Run("DELETE FROM query_folders WHERE id=@p0", folder["id"]); return new { ok = true };
            }
            return null;
        }
        if (p.Length == 4 && method == "GET") return ProjectQueries(me, project);
        Row? previous = null;
        if (p.Length >= 5)
        {
            previous = db.One("SELECT * FROM queries WHERE id=@p0 AND project_id=@p1 AND (user_id=@p2 OR shared=1)", Id(p[4]), project, me["id"]); Check(previous == null, 404, "查询不存在");
            if (p.Length == 6 && p[5] == "favorite" && method == "POST")
            {
                db.Run("DELETE FROM query_favorites WHERE query_id=@p0 AND user_id=@p1", previous!["id"], me["id"]); if (Number(body, "favorite", 0, 1) == 1) db.Run("INSERT INTO query_favorites(query_id,user_id) VALUES(@p0,@p1)", previous["id"], me["id"]); return new { ok = true };
            }
            if (p.Length == 6 && p[5] == "run" && method == "GET")
            {
                return ExecuteQuery(me, project, S(previous!, "filters"));
            }
            if (method == "GET" && p.Length == 5) return previous!;
            Check(N(previous!, "user_id") != N(me, "id") && !(N(previous, "shared") == 1 && N(me, "admin") == 1), 403, "只能修改自己的查询");
            if (N(previous, "shared") == 1) Access(me, project, true);
            if (method == "DELETE" && p.Length == 5) { db.Run("DELETE FROM query_favorites WHERE query_id=@p0", previous["id"]); db.Run("DELETE FROM queries WHERE id=@p0", previous["id"]); return new { ok = true }; }
        }
        if (p.Length == 4 && method == "POST" || p.Length == 5 && method == "PATCH")
        {
            var filters = Text(body, "filters", 20000); ValidateFilters(filters, me); var shared = Number(body, "shared", 0, 1); if (shared == 1) Access(me, project, true);
            var folder = Text(body, "folder", 200, true); var name = Text(body, "name", 100);
            if (folder != "") Check(db.One("SELECT id FROM query_folders WHERE project_id=@p0 AND name=@p1 AND shared=@p2 AND (shared=1 OR user_id=@p3)", project, folder, shared, me["id"]) == null, 400, "请选择对应范围内的文件夹");
            if (previous != null)
            {
                Check(Number(body, "version") != N(previous, "version"), 409, "查询已更新，请刷新"); db.Run("UPDATE queries SET name=@p0,filters=@p1,shared=@p2,folder=@p3,version=version+1,changed_by=@p5,changed=@p6 WHERE id=@p4", name, filters, shared, folder, previous["id"], me["id"], DateTime.UtcNow.ToString("O")); return new { id = previous["id"] };
            }
            return new { id = db.Insert("INSERT INTO queries(project_id,user_id,name,filters,shared,folder,changed_by,changed) VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p1,@p6)", project, me["id"], name, filters, shared, folder, DateTime.UtcNow.ToString("O")) };
        }
        return null;
    }
}
