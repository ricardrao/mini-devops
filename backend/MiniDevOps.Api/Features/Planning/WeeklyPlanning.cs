using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed partial class Api
{
    object? WeeklyRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (p.Length != 4 || p[1] != "projects" || ctx.Request.Method != "POST" || p[3] is not ("weekly-iterations" or "schedule-preview" or "schedule")) return null;
        var project = Id(p[2]); Access(me, project, true);
        if (p[3] == "weekly-iterations")
        {
            var startText = Text(body, "start_date", 10);
            Check(!DateOnly.TryParseExact(startText, "yyyy-MM-dd", out var start), 400, "请选择有效的开始日期");
            var count = Number(body, "count", 1, 26, 6); var first = Number(body, "first_number", 1, 999, 1);
            Check(start.DayNumber > DateOnly.MaxValue.DayNumber - count * 7, 400, "日期超出支持范围");
            var prefix = Text(body, "prefix", 50); var result = new List<Row>(); var created = 0;
            for (var n = 0; n < count; n++)
            {
                var from = start.AddDays(n * 7); var to = from.AddDays(6);
                var name = $"{prefix} Wk{first + n:00} ({from:MM/dd} - {to:MM/dd})";
                var existing = db.One("SELECT * FROM iterations WHERE project_id=@p0 AND name=@p1", project, name);
                Check(existing != null && (S(existing, "start_date") != from.ToString("yyyy-MM-dd") || S(existing, "end_date") != to.ToString("yyyy-MM-dd")), 409, "同名迭代的日期不同，请更换前缀或周编号");
                if (existing == null)
                {
                    var id = db.Insert("INSERT INTO iterations(project_id,name,start_date,end_date) VALUES(@p0,@p1,@p2,@p3)", project, name, from.ToString("yyyy-MM-dd"), to.ToString("yyyy-MM-dd"));
                    existing = db.One("SELECT * FROM iterations WHERE id=@p0", id)!; created++;
                }
                result.Add(existing);
            }
            return new { iterations = result, created, reused = result.Count - created };
        }
        var rootId = Number(body, "item_id"); var root = Item(me, rootId, true);
        Check(N(root, "project_id") != project || N(root, "deleted") == 1 || S(root, "state") == "Removed", 404, "工作项不属于此项目或已移除");
        Check(!body.TryGetProperty("iteration_id", out _), 400, "请选择目标迭代或明确设为未安排");
        var target = Reference(body, "iteration_id");
        Check(target != null && db.One("SELECT id FROM iterations WHERE id=@p0 AND project_id=@p1", target, project) == null, 400, "目标迭代不属于此项目");
        var children = body.TryGetProperty("include_children", out var include) && include.ValueKind == JsonValueKind.True;
        var rows = db.All("SELECT id,parent_id,version,title,type,state,iteration_id,deleted FROM items WHERE project_id=@p0", project);
        var byParent = rows.Where(r => r["parent_id"] != null).ToLookup(r => N(r, "parent_id"));
        var selected = new List<Row>(); var pending = new Queue<Row>(); var seen = new HashSet<long>(); pending.Enqueue(rows.Single(r => N(r, "id") == rootId));
        while (pending.Count > 0)
        {
            var row = pending.Dequeue(); Check(!seen.Add(N(row, "id")), 400, "父子关系存在循环");
            if (N(row, "deleted") == 0 && S(row, "state") != "Removed") selected.Add(row);
            Check(seen.Count > 1000, 400, "一次最多安排 1000 个工作项，请分组操作");
            if (children) foreach (var child in byParent[N(row, "id")]) pending.Enqueue(child);
        }
        if (p[3] == "schedule-preview") return new { items = selected, iteration_id = target };
        Check(!body.TryGetProperty("items", out var expected) || expected.ValueKind != JsonValueKind.Array || expected.GetArrayLength() != selected.Count, 409, "工作项层级已变化，请重新预览");
        var versions = new Dictionary<long, long>();
        foreach (var entry in expected.EnumerateArray()) Check(!versions.TryAdd(Number(entry, "id"), Number(entry, "version")), 400, "工作项不能重复");
        Check(selected.Any(r => !versions.TryGetValue(N(r, "id"), out var version) || version != N(r, "version")), 409, "工作项已更新，请重新预览安排");
        var changed = 0;
        foreach (var row in selected)
        {
            if ((row["iteration_id"]?.ToString() ?? "") == (target?.ToString() ?? "")) continue;
            Save(me, project, JsonSerializer.SerializeToElement(new { iteration_id = target, version = row["version"] }), Item(me, N(row, "id"), true)); changed++;
        }
        return new { count = selected.Count, changed };
    }
}
