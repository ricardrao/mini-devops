using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed record DeliveryRow(long project_id, long team_id, string level);
public sealed partial class Api
{
    bool CanReadProject(Row me, long project) => N(me, "admin") == 1 || db.One("SELECT role FROM members WHERE project_id=@p0 AND user_id=@p1", project, me["id"]) != null;
    object? DeliveryRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries); var method = ctx.Request.Method;
        if (p.Length < 4 || p[1] != "projects" || p[3] != "delivery-plans") return null;
        var project = Id(p[2]); var role = Access(me, project, method != "GET");
        if (p.Length == 4 && method == "GET") return db.All("SELECT d.id,d.name,d.description,d.version,d.changed,u.name changed_by_name FROM delivery_plans d JOIN users u ON u.id=d.changed_by WHERE d.project_id=@p0 ORDER BY d.name", project);
        Row? plan = null;
        if (p.Length == 5) { plan = db.One("SELECT * FROM delivery_plans WHERE id=@p0 AND project_id=@p1", Id(p[4]), project); Check(plan == null, 404, "交付计划不存在"); }
        if (p.Length == 5 && method == "DELETE") { Check(Number(body, "version") != N(plan!, "version"), 409, "计划已更新，请刷新"); db.Run("DELETE FROM delivery_plans WHERE id=@p0", plan!["id"]); return new { ok = true }; }
        if (p.Length == 4 && method == "POST" || p.Length == 5 && method == "PATCH")
        {
            var name = Text(body, "name", 100); var description = Text(body, "description", 2000, true);
            Check(!body.TryGetProperty("rows", out var raw) || raw.ValueKind != JsonValueKind.Array || raw.GetArrayLength() is < 1 or > 20, 400, "计划需要 1–20 个团队行");
            var rows = new List<DeliveryRow>(); var seen = new HashSet<string>();
            foreach (var entry in raw.EnumerateArray())
            {
                Check(entry.ValueKind != JsonValueKind.Object, 400, "团队行无效");
                var pid = Number(entry, "project_id", 1); var tid = Number(entry, "team_id", 1); var level = Text(entry, "level", 40);
                Check(!Levels.ContainsKey(level), 400, "待办层级无效"); Access(me, pid); Team(pid, tid);
                Check(!seen.Add($"{tid}:{level}"), 400, "团队与层级不能重复"); rows.Add(new(pid, tid, level));
            }
            var definition = JsonSerializer.Serialize(rows);
            if (plan != null)
            {
                Check(Number(body, "version") != N(plan, "version"), 409, "计划已更新，请刷新");
                db.Run("UPDATE delivery_plans SET name=@p0,description=@p1,definition=@p2,version=version+1,changed_by=@p3,changed=@p4 WHERE id=@p5", name, description, definition, me["id"], Now(), plan["id"]); return new { id = plan["id"] };
            }
            return new { id = db.Insert("INSERT INTO delivery_plans(project_id,name,description,definition,changed_by,changed) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", project, name, description, definition, me["id"], Now()) };
        }
        if (p.Length == 5 && method == "GET")
        {
            var startText = ctx.Request.Query["start"].ToString(); var endText = ctx.Request.Query["end"].ToString();
            if (startText == "") startText = DateTime.UtcNow.Date.AddDays(-(int)DateTime.UtcNow.DayOfWeek).ToString("yyyy-MM-dd");
            Check(!DateOnly.TryParseExact(startText, "yyyy-MM-dd", out var start) || start.Year < 1900 || start.Year > 9900, 400, "计划日期无效");
            if (endText == "") endText = start.AddDays(55).ToString("yyyy-MM-dd");
            Check(!DateOnly.TryParseExact(endText, "yyyy-MM-dd", out var end), 400, "计划日期无效");
            Check(end < start || end.DayNumber - start.DayNumber > 182, 400, "计划窗口为 1–183 天");
            var selected = JsonSerializer.Deserialize<List<DeliveryRow>>(S(plan!, "definition"))!;
            var visible = selected.Where(r => CanReadProject(me, r.project_id)).ToArray(); var rows = new List<object>(); var scheduled = new Dictionary<long, Row>();
            foreach (var row in visible)
            {
                var team = db.One("SELECT t.*,p.name project_name FROM teams t JOIN projects p ON p.id=t.project_id WHERE t.id=@p0 AND t.project_id=@p1", row.team_id, row.project_id); if (team == null) continue;
                var parameters = new List<object?> { row.project_id }; var where = new List<string> { "i.project_id=@p0", "i.deleted=0", "i.state!='Removed'" }; AddTeamFilter(row.project_id, row.team_id, where, parameters);
                var types = Levels[row.level]; where.Add("i.type IN (" + string.Join(',', types.Select(t => { var key = "@p" + parameters.Count; parameters.Add(t); return key; })) + ")");
                var predicate = string.Join(" AND ", where);
                Check(N(db.One("SELECT COUNT(*) n FROM items i WHERE " + predicate, parameters.ToArray())!, "n") > 2000, 400, "单个团队行超过 2000 个工作项，请缩小团队 Area 范围");
                var items = db.All("SELECT i.*,u.name assignee_name,(SELECT COUNT(*) FROM items c WHERE c.parent_id=i.id AND c.deleted=0) child_count,(SELECT COUNT(*) FROM items c WHERE c.parent_id=i.id AND c.deleted=0 AND c.state='Done') child_done FROM items i LEFT JOIN users u ON u.id=i.assignee_id WHERE " + predicate + " ORDER BY i.backlog_rank,i.id", parameters.ToArray());
                var iterations = db.All("SELECT * FROM iterations WHERE project_id=@p0 AND start_date<=@p2 AND end_date>=@p1 ORDER BY start_date,id", row.project_id, startText, endText);
                var iterationIds = iterations.Select(i => N(i, "id")).ToHashSet();
                var shown = items.Where(i => i["iteration_id"] == null || iterationIds.Contains(N(i, "iteration_id"))).ToArray();
                foreach (var item in shown) if (item["iteration_id"] != null) scheduled[N(item, "id")] = item;
                rows.Add(new { project_id = row.project_id, team_id = row.team_id, row.level, project_name = team["project_name"], team_name = team["name"], can_edit = Access(me, row.project_id) != "reader", iterations, items = shown });
            }
            var dependencies = db.All("SELECT source_id,target_id FROM item_links WHERE kind='dependency'").Where(l => scheduled.ContainsKey(N(l, "source_id")) && scheduled.ContainsKey(N(l, "target_id"))).ToArray();
            return new { id = plan!["id"], name = plan["name"], description = plan["description"], version = plan["version"], can_edit = role != "reader" && selected.Count == visible.Length, restricted = selected.Count != visible.Length, start_date = startText, end_date = endText, rows, dependencies };
        }
        return null;
    }
}
