using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed partial class Api
{
    static void CheckExpected(JsonElement body, Row current, params string[] fields)
    {
        Check(!body.TryGetProperty("expected", out var expected) || expected.ValueKind != JsonValueKind.Object, 400, "缺少原始记录，请刷新后重试");
        foreach (var field in fields)
            Check(!expected.TryGetProperty(field, out var value) || value.ValueKind != JsonValueKind.String || value.GetString() != S(current, field), 409, "记录已被修改，请刷新后重试");
    }
    object? ProjectRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries); var method = ctx.Request.Method;
        if (p.Length < 3 || p[1] != "projects") return null;
        var project = Id(p[2]);
        if (p.Length == 4 && p[3] == "summary" && method == "GET")
        {
            Access(me, project);
            var stats = db.One("""
                SELECT COUNT(*) total,
                COALESCE(SUM(CASE WHEN state='Done' THEN 1 ELSE 0 END),0) completed,
                COALESCE(SUM(CASE WHEN state!='Done' THEN 1 ELSE 0 END),0) open,
                COALESCE(SUM(CASE WHEN blocked=1 AND state!='Done' THEN 1 ELSE 0 END),0) blocked,
                COALESCE(SUM(CASE WHEN target_date!='' AND target_date<@p1 AND state!='Done' THEN 1 ELSE 0 END),0) overdue,
                COALESCE(SUM(CASE WHEN type IN ('Task','Bug') AND state!='Done' THEN remaining_work ELSE 0 END),0) remaining_work
                FROM items WHERE project_id=@p0 AND deleted=0 AND state!='Removed'
                """, project, DateTime.UtcNow.ToString("yyyy-MM-dd"))!;
            var byType = db.All("SELECT type,COUNT(*) count FROM items WHERE project_id=@p0 AND deleted=0 AND state!='Removed' GROUP BY type ORDER BY type", project);
            var iterations = db.All("""
                SELECT t.id,t.name,t.start_date,t.end_date,COUNT(i.id) total,
                COALESCE(SUM(CASE WHEN i.state='Done' THEN 1 ELSE 0 END),0) completed,
                COALESCE(SUM(CASE WHEN i.type IN ('Task','Bug') AND i.state!='Done' THEN i.remaining_work ELSE 0 END),0) remaining_work
                FROM iterations t LEFT JOIN items i ON i.iteration_id=t.id AND i.deleted=0 AND i.state!='Removed'
                WHERE t.project_id=@p0 GROUP BY t.id,t.name,t.start_date,t.end_date ORDER BY t.start_date,t.id
                """, project);
            return new { stats, by_type = byType, iterations };
        }
        if (p.Length == 3 && method == "PATCH")
        {
            Access(me, project, true); Admin(me);
            var current = db.One("SELECT * FROM projects WHERE id=@p0", project)!;
            CheckExpected(body, current, "name", "description");
            db.Run("UPDATE projects SET name=@p0,description=@p1 WHERE id=@p2", Text(body, "name", 100), Text(body, "description", 2000, true), project);
            return db.One("SELECT * FROM projects WHERE id=@p0", project)!;
        }
        if (p.Length != 5 || p[3] != "iterations" || method is not ("PATCH" or "DELETE")) return null;
        Access(me, project, true); var iteration = Id(p[4]);
        var previous = db.One("SELECT * FROM iterations WHERE id=@p0 AND project_id=@p1", iteration, project);
        Check(previous == null, 404, "迭代不存在"); CheckExpected(body, previous!, "name", "start_date", "end_date");
        if (method == "DELETE")
        {
            Check(db.One("SELECT id FROM items WHERE iteration_id=@p0 LIMIT 1", iteration) != null, 409, "迭代仍有工作项（包括回收站），请先重新安排这些工作项");
            Check(db.One("SELECT id FROM teams WHERE default_iteration_id=@p0 LIMIT 1", iteration) != null, 409, "请先更改团队的默认迭代");
            db.Run("DELETE FROM capacities WHERE iteration_id=@p0", iteration); db.Run("DELETE FROM team_days_off WHERE iteration_id=@p0", iteration);
            db.Run("DELETE FROM iterations WHERE id=@p0", iteration); return new { ok = true };
        }
        var start = Text(body, "start_date", 10); var end = Text(body, "end_date", 10);
        Check(!DateOnly.TryParseExact(start, "yyyy-MM-dd", out var from) || !DateOnly.TryParseExact(end, "yyyy-MM-dd", out var to) || to < from || to.DayNumber - from.DayNumber > 366, 400, "迭代需有有效起止日期，且不超过一年");
        var dayLists = db.All("SELECT days_off dates FROM capacities WHERE iteration_id=@p0", iteration)
            .Concat(db.All("SELECT dates FROM team_days_off WHERE iteration_id=@p0", iteration));
        Check(dayLists.Any(row => JsonSerializer.Deserialize<string[]>(S(row, "dates"))!.Any(day => string.CompareOrdinal(day, start) < 0 || string.CompareOrdinal(day, end) > 0)), 409, "新日期范围不包含现有休假，请先在 Capacity 中调整休假日期");
        db.Run("UPDATE iterations SET name=@p0,start_date=@p1,end_date=@p2 WHERE id=@p3", Text(body, "name", 100), start, end, iteration);
        return db.One("SELECT * FROM iterations WHERE id=@p0", iteration)!;
    }
}
