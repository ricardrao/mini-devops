using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed partial class Api
{
    static string[] CalendarDates(JsonElement body, string key, DateOnly start, DateOnly end)
    {
        if (!body.TryGetProperty(key, out var value)) return [];
        Check(value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 366, 400, "休假日期格式错误"); var dates = new List<string>();
        foreach (var d in value.EnumerateArray()) { Check(d.ValueKind != JsonValueKind.String || !DateOnly.TryParseExact(d.GetString(), "yyyy-MM-dd", out _), 400, "休假日期格式错误"); var date = DateOnly.ParseExact(d.GetString()!, "yyyy-MM-dd"); Check(date < start || date > end, 400, "休假日期必须在迭代范围内"); dates.Add(d.GetString()!); }
        return dates.Distinct().ToArray();
    }
    object? PlanningRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries); var method = ctx.Request.Method;
        if (p.Length != 4 || p[1] != "projects" || p[3] != "planning") return null;
        var project = Id(p[2]); Access(me, project, method != "GET"); var teamId = Id(ctx.Request.Query["team_id"]!); var team = Team(project, teamId); var iterationId = Id(ctx.Request.Query["iteration_id"]!);
        var iteration = db.One("SELECT * FROM iterations WHERE id=@p0 AND project_id=@p1", iterationId, project); Check(iteration == null, 404, "迭代不存在");
        var start = DateOnly.ParseExact(S(iteration!, "start_date"), "yyyy-MM-dd"); var end = DateOnly.ParseExact(S(iteration, "end_date"), "yyyy-MM-dd"); Check(end.DayNumber - start.DayNumber > 366, 400, "容量和趋势支持一年以内的迭代");
        if (method == "PUT")
        {
            Check(!body.TryGetProperty("capacities", out var capacities) || capacities.ValueKind != JsonValueKind.Array || capacities.GetArrayLength() > 300, 400, "容量配置无效");
            var seen = new HashSet<long>(); var rows = new List<(long User, decimal Capacity, string Activity, string[] Days)>();
            foreach (var entry in capacities.EnumerateArray())
            {
                var uid = Number(entry, "user_id"); Check(!seen.Add(uid) || db.One("SELECT user_id FROM members WHERE project_id=@p0 AND user_id=@p1", project, uid) == null, 400, "容量成员必须是项目成员且不能重复");
                rows.Add((uid, Decimal(entry, "per_day", 24), Text(entry, "activity", 80, true), CalendarDates(entry, "days_off", start, end)));
            }
            var teamOff = CalendarDates(body, "team_days_off", start, end);
            db.Run("DELETE FROM capacities WHERE team_id=@p0 AND iteration_id=@p1", teamId, iterationId);
            foreach (var row in rows) db.Run("INSERT INTO capacities(team_id,iteration_id,user_id,per_day,activity,days_off) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", teamId, iterationId, row.User, row.Capacity, row.Activity, JsonSerializer.Serialize(row.Days));
            db.Run("DELETE FROM team_days_off WHERE team_id=@p0 AND iteration_id=@p1", teamId, iterationId); db.Run("INSERT INTO team_days_off(team_id,iteration_id,dates) VALUES(@p0,@p1,@p2)", teamId, iterationId, JsonSerializer.Serialize(teamOff)); return new { ok = true };
        }
        if (method != "GET") return null;
        var args = new List<object?> { project, iterationId }; var where = new List<string> { "i.project_id=@p0", "i.iteration_id=@p1", "i.deleted=0", "i.state!='Removed'" }; AddTeamFilter(project, teamId, where, args);
        var items = db.All("SELECT i.*,u.name assignee_name FROM items i LEFT JOIN users u ON u.id=i.assignee_id WHERE " + string.Join(" AND ", where) + " ORDER BY i.backlog_rank,i.id LIMIT 5000", args.ToArray());
        var parents = new List<Row>(); foreach (var parent in items.Where(i => i["parent_id"] != null).Select(i => N(i, "parent_id")).Distinct())
        { var row = db.One("SELECT id,title,type,state,assignee_id FROM items WHERE id=@p0 AND project_id=@p1 AND deleted=0", parent, project); if (row != null) parents.Add(row); }
        var members = db.All("SELECT u.id,u.name FROM users u JOIN members m ON m.user_id=u.id WHERE m.project_id=@p0 ORDER BY u.name", project);
        var caps = db.All("SELECT * FROM capacities WHERE team_id=@p0 AND iteration_id=@p1", teamId, iterationId).ToDictionary(c => N(c, "user_id"));
        var savedDays = db.One("SELECT dates FROM team_days_off WHERE team_id=@p0 AND iteration_id=@p1", teamId, iterationId);
        var off = JsonSerializer.Deserialize<string[]>(savedDays?["dates"]?.ToString() ?? "[]")!;
        var weekdays = JsonSerializer.Deserialize<int[]>(S(team, "working_days"))!; var dates = Enumerable.Range(0, end.DayNumber - start.DayNumber + 1).Select(start.AddDays).ToArray(); var today = DateOnly.FromDateTime(DateTime.UtcNow);
        foreach (var member in members)
        {
            caps.TryGetValue(N(member, "id"), out var cap); var days = JsonSerializer.Deserialize<string[]>(cap == null ? "[]" : S(cap, "days_off"))!;
            var valid = dates.Where(d => weekdays.Contains((int)d.DayOfWeek) && !off.Contains(d.ToString("yyyy-MM-dd")) && !days.Contains(d.ToString("yyyy-MM-dd"))).ToArray(); var perDay = cap == null ? 0m : Convert.ToDecimal(cap["per_day"]);
            member["has_capacity"] = cap != null;
            member["per_day"] = perDay; member["activity"] = cap == null ? "" : cap["activity"]; member["days_off"] = days; member["total_capacity"] = valid.Length * perDay; member["remaining_capacity"] = valid.Count(d => d >= today) * perDay;
            member["remaining_work"] = items.Where(i => N(i, "assignee_id") == N(member, "id") && S(i, "type") is "Task" or "Bug" && S(i, "state") != "Done").Sum(i => Convert.ToDecimal(i["remaining_work"]));
        }
        var revisions = db.All("SELECT recorded,snapshot FROM item_revisions WHERE project_id=@p0 ORDER BY recorded,id", project);
        var coverage = revisions.Count == 0 ? today : DateOnly.FromDateTime(DateTime.Parse(S(revisions[0], "recorded"), null, System.Globalization.DateTimeStyles.RoundtripKind));
        var snapshots = revisions.Select(r => (Time: DateTimeOffset.Parse(S(r, "recorded")), Item: JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(S(r, "snapshot"))!)).ToArray();
        var series = new List<object>(); var allWorking = dates.Count(d => weekdays.Contains((int)d.DayOfWeek) && !off.Contains(d.ToString("yyyy-MM-dd")));
        var scope = items.Where(i => S(i, "type") is "Task" or "Bug").Sum(i => Math.Max(Convert.ToDecimal(i["original_estimate"]), Convert.ToDecimal(i["remaining_work"]) + Convert.ToDecimal(i["completed_work"])));
        foreach (var date in dates)
        {
            decimal? actual = null;
            if (date >= coverage && date <= today)
            {
                var cutoff = new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                var latest = snapshots.Where(s => s.Time < cutoff).GroupBy(s => s.Item["id"].GetInt64()).Select(g => g.Last().Item);
                actual = latest.Where(s => s["iteration_id"].ValueKind != JsonValueKind.Null && s["iteration_id"].GetInt64() == iterationId && s["deleted"].GetInt32() == 0 && s["type"].GetString() is "Task" or "Bug" && s["state"].GetString() is not ("Done" or "Removed") && InTeam(new Row { ["area"] = s["area"].GetString() }, team)).Sum(s => s["remaining_work"].GetDecimal());
            }
            var elapsed = dates.Count(d => d <= date && weekdays.Contains((int)d.DayOfWeek) && !off.Contains(d.ToString("yyyy-MM-dd")));
            series.Add(new { date = date.ToString("yyyy-MM-dd"), remaining = actual, ideal = allWorking == 0 ? 0 : decimal.Round(scope * (allWorking - elapsed) / allWorking, 2), working = weekdays.Contains((int)date.DayOfWeek) && !off.Contains(date.ToString("yyyy-MM-dd")) });
        }
        return new { iteration, team, items, parents, capacity_configured = savedDays != null || caps.Count > 0, capacities = members, team_days_off = off, working_days = weekdays, workdays_remaining = dates.Count(d => d >= today && weekdays.Contains((int)d.DayOfWeek) && !off.Contains(d.ToString("yyyy-MM-dd"))), analytics = new { series, coverage_start = coverage.ToString("yyyy-MM-dd"), scope, remaining = items.Where(i => S(i, "type") is "Task" or "Bug" && S(i, "state") != "Done").Sum(i => Convert.ToDecimal(i["remaining_work"])), unestimated = items.Count(i => S(i, "type") is "Task" or "Bug" && S(i, "state") != "Done" && Convert.ToDecimal(i["remaining_work"]) == 0) } };
    }
}
