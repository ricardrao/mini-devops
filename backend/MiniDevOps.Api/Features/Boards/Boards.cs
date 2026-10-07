using System.Globalization;
using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed record BoardColumn(string id, string name, Dictionary<string, string> mappings, int limit = 0, bool split = false, string description = "");
public sealed record BoardLane(string id, string name);
public sealed record BoardDefinition(List<BoardColumn> columns, List<BoardLane> lanes, List<string> card_fields);
public sealed partial class Api
{
    static readonly Dictionary<string, string[]> Levels = new() { ["backlog"] = ["Product Backlog Item"], ["features"] = ["Feature"], ["epics"] = ["Epic"], ["tasks"] = ["Task", "Bug"], ["bugs"] = ["Bug"] };
    static decimal Decimal(JsonElement body, string key, decimal max = 100000)
    {
        if (!body.TryGetProperty(key, out var value)) return 0;
        Check(value.ValueKind != JsonValueKind.Number || !value.TryGetDecimal(out _), 400, key + " 必须是数字"); var n = value.GetDecimal();
        Check(n < 0 || n > max || decimal.Round(n, 2) != n, 400, key + " 必须为非负数字，最多两位小数"); return n;
    }
    static string OptionalDate(JsonElement body, string key)
    {
        var value = Text(body, key, 10, true); Check(value != "" && !DateOnly.TryParseExact(value, "yyyy-MM-dd", out _), 400, key + " 日期无效"); return value;
    }
    void Snapshot(long id)
    {
        var item = db.One("SELECT * FROM items WHERE id=@p0", id)!;
        db.Run("INSERT INTO item_revisions(item_id,project_id,recorded,snapshot) VALUES(@p0,@p1,@p2,@p3)", id, item["project_id"], Now(), JsonSerializer.Serialize(item));
    }
    Row Team(long project, long team)
    {
        var result = db.One("SELECT * FROM teams WHERE id=@p0 AND project_id=@p1", team, project); Check(result == null, 404, "团队不属于此项目"); return result!;
    }
    void AddTeamFilter(long project, long team, List<string> where, List<object?> args)
    {
        var areas = JsonSerializer.Deserialize<string[]>(S(Team(project, team), "areas"))!;
        if (areas.Length == 0) return; var terms = new List<string>();
        foreach (var area in areas) { terms.Add($"(i.area=@p{args.Count} OR i.area LIKE @p{args.Count + 1} ESCAPE '!')"); args.Add(area); args.Add(area.Replace("!", "!!").Replace("%", "!%").Replace("_", "!_") + "\\%"); }
        where.Add("(" + string.Join(" OR ", terms) + ")");
    }
    bool InTeam(Row item, Row team) => JsonSerializer.Deserialize<string[]>(S(team, "areas"))! is var areas && (areas.Length == 0 || areas.Any(a => S(item, "area") == a || S(item, "area").StartsWith(a + "\\", StringComparison.Ordinal)));
    static BoardDefinition DefaultBoard(string level)
    {
        Check(!Levels.ContainsKey(level), 400, "看板层级无效");
        var columns = new List<BoardColumn>();
        if (level == "backlog")
        {
            foreach (var name in new[] { "New", "Approved", "Active", "Committed", "In Progress", "In Review", "Resolved", "Done" })
                columns.Add(new(name.ToLowerInvariant().Replace(' ', '-'), name, new() { ["Product Backlog Item"] = new[] { "In Progress", "In Review", "Resolved" }.Contains(name) ? "New" : name }, name is "New" or "Done" ? 0 : 5));
        }
        else
        {
            var states = Levels[level].SelectMany(t => Types[t]).Where(s => s != "Removed").Distinct().ToArray();
            foreach (var name in states.Where(s => s != "Done").Append("Done"))
            {
                var maps = Levels[level].Where(t => Types[t].Contains(name)).ToDictionary(t => t, _ => name);
                // A shared incoming column for Task/Bug keeps their independent initial states.
                if (level == "tasks" && name == "To Do") maps["Bug"] = "New";
                if (level == "tasks" && name == "New") continue;
                columns.Add(new(name.ToLowerInvariant().Replace(' ', '-'), name, maps, name is "New" or "To Do" or "Done" ? 0 : 5));
            }
        }
        return new(columns, [new("default", "默认泳道")], ["assignee", "tags", "children"]);
    }
    (BoardDefinition Definition, long Version) BoardConfig(long team, string level)
    {
        Check(!Levels.ContainsKey(level), 400, "看板层级无效");
        var row = db.One("SELECT definition,version FROM board_configs WHERE team_id=@p0 AND level=@p1", team, level);
        return row == null ? (DefaultBoard(level), 0) : (JsonSerializer.Deserialize<BoardDefinition>(S(row, "definition"))!, N(row, "version"));
    }
    void ValidateBoard(BoardDefinition definition, string level)
    {
        Check(definition.columns == null || definition.lanes == null || definition.card_fields == null, 400, "看板配置不完整");
        Check(definition.columns!.Count is < 2 or > 12 || definition.lanes!.Count is < 1 or > 8, 400, "看板需 2–12 列、1–8 条泳道");
        var ids = new HashSet<string>();
        foreach (var col in definition.columns)
        {
            Check(string.IsNullOrWhiteSpace(col.id) || col.id.Length > 80 || !ids.Add(col.id) || string.IsNullOrWhiteSpace(col.name) || col.name.Length > 60 || col.description == null || col.description.Length > 2000 || col.limit is < 0 or > 10000 || col.mappings == null || col.mappings.Count == 0, 400, "看板列配置无效");
            foreach (var pair in col.mappings!) Check(!Levels[level].Contains(pair.Key) || !Types[pair.Key].Contains(pair.Value) || pair.Value == "Removed", 400, "看板列必须映射到该类型的有效状态");
        }
        ids.Clear(); foreach (var lane in definition.lanes) Check(string.IsNullOrWhiteSpace(lane.id) || lane.id.Length > 80 || !ids.Add(lane.id) || string.IsNullOrWhiteSpace(lane.name) || lane.name.Length > 60, 400, "泳道配置无效");
        Check(definition.card_fields!.Any(f => !new[] { "assignee", "tags", "estimate", "children", "remaining_work", "priority" }.Contains(f)), 400, "卡片字段无效");
        foreach (var type in Levels[level]) Check(!definition.columns.Any(c => c.mappings.ContainsKey(type)), 400, "每种工作项类型至少需要一个映射列");
    }
    object? BoardRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries); var method = ctx.Request.Method;
        if (p.Length < 4 || p[1] != "projects") return null;
        var project = Id(p[2]);
        if (p[3] == "teams")
        {
            Access(me, project); if (p.Length == 4 && method == "GET") return db.All("SELECT * FROM teams WHERE project_id=@p0 ORDER BY id", project);
            if (method is not ("POST" or "PATCH")) return null; Admin(me);
            var name = Text(body, "name", 100); var areas = Text(body, "areas", 4000, true).Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct().ToArray();
            Check(areas.Length > 30 || areas.Any(a => a.Length > 200), 400, "最多 30 个 Area Path，每项不超过 200 字符");
            var iteration = Reference(body, "default_iteration_id"); if (iteration != null) Check(db.One("SELECT id FROM iterations WHERE id=@p0 AND project_id=@p1", iteration, project) == null, 400, "默认迭代不属于该项目");
            var days = body.TryGetProperty("working_days", out var wd) ? wd.Deserialize<int[]>()! : [1, 2, 3, 4, 5]; Check(days == null || days.Length == 0 || days.Length > 7 || days.Any(d => d is < 0 or > 6), 400, "请选择有效工作日");
            if (p.Length == 5 && method == "PATCH") { var team = Id(p[4]); Team(project, team); db.Run("UPDATE teams SET name=@p0,areas=@p1,working_days=@p2,default_iteration_id=@p3 WHERE id=@p4", name, JsonSerializer.Serialize(areas), JsonSerializer.Serialize(days), iteration, team); return new { id = team }; }
            Check(p.Length != 4 || method != "POST", 404, "接口不存在");
            var createdTeam = db.Insert("INSERT INTO teams(project_id,name,areas,working_days,default_iteration_id) VALUES(@p0,@p1,@p2,@p3,@p4)", project, name, JsonSerializer.Serialize(areas), JsonSerializer.Serialize(days), iteration);
            db.Run("INSERT INTO team_members(team_id,user_id) VALUES(@p0,@p1)", createdTeam, me["id"]); return new { id = createdTeam };
        }
        if (p[3] == "board" && p.Length == 4)
        {
            Access(me, project, method != "GET"); var teamId = Id(ctx.Request.Query["team_id"]!); var team = Team(project, teamId); var level = ctx.Request.Query["level"].ToString(); if (level == "") level = "backlog";
            var (definition, version) = BoardConfig(teamId, level);
            if (method == "GET")
            {
                var where = new List<string> { "i.project_id=@p0", "i.deleted=0", "i.state!='Removed'" }; var args = new List<object?> { project }; AddTeamFilter(project, teamId, where, args);
                var typeTerms = new List<string>(); foreach (var type in Levels[level]) { typeTerms.Add("@p" + args.Count); args.Add(type); } where.Add("i.type IN (" + string.Join(',', typeTerms) + ")");
                var sql = string.Join(" AND ", where); var total = N(db.One("SELECT COUNT(*) total FROM items i WHERE " + sql, args.ToArray())!, "total");
                var items = db.All("SELECT i.*,u.name assignee_name,(SELECT COUNT(*) FROM items ch WHERE ch.parent_id=i.id AND ch.deleted=0) child_count,(SELECT COUNT(*) FROM items ch WHERE ch.parent_id=i.id AND ch.deleted=0 AND ch.state='Done') child_done FROM items i LEFT JOIN users u ON u.id=i.assignee_id WHERE " + sql + " ORDER BY i.backlog_rank,i.id LIMIT 2000", args.ToArray());
                var childCounts = db.All("SELECT ch.parent_id,ch.type,COUNT(*) total,SUM(CASE WHEN ch.state='Done' THEN 1 ELSE 0 END) completed FROM items ch WHERE ch.project_id=@p0 AND ch.deleted=0 AND ch.state!='Removed' AND ch.parent_id IS NOT NULL GROUP BY ch.parent_id,ch.type", project).GroupBy(r => N(r, "parent_id")).ToDictionary(g => g.Key, g => g.ToArray());
                var placements = db.All("SELECT * FROM board_placements WHERE team_id=@p0 AND level=@p1", teamId, level).ToDictionary(r => N(r, "item_id"));
                foreach (var item in items)
                {
                    item["child_counts"] = childCounts.GetValueOrDefault(N(item, "id")) ?? [];
                    placements.TryGetValue(N(item, "id"), out var position);
                    var column = definition.columns.FirstOrDefault(c => c.id == (position == null ? "" : S(position, "column_id")) && c.mappings.GetValueOrDefault(S(item, "type")) == S(item, "state")) ?? definition.columns.FirstOrDefault(c => c.mappings.GetValueOrDefault(S(item, "type")) == S(item, "state"));
                    item["board_column"] = column?.id ?? "unmapped"; item["board_lane"] = definition.lanes.Any(l => l.id == (position == null ? "" : S(position, "lane_id"))) ? position!["lane_id"] : definition.lanes[0].id;
                    item["column_done"] = column?.split == true && position != null && N(position, "column_done") == 1;
                }
                return new { definition, version, team, level, types = Levels[level], items, total };
            }
            if (method == "PUT")
            {
                Admin(me); Check(Number(body, "version", 0) != version, 409, "看板配置已更新，请刷新后再修改");
                Check(!body.TryGetProperty("definition", out var value), 400, "缺少看板配置"); var next = value.Deserialize<BoardDefinition>(); Check(next == null, 400, "看板配置无效"); ValidateBoard(next!, level);
                // Existing cards in removed lanes/columns fall back to their valid state mapping.
                db.Run("DELETE FROM board_configs WHERE team_id=@p0 AND level=@p1", teamId, level); db.Run("INSERT INTO board_configs(team_id,level,definition,version) VALUES(@p0,@p1,@p2,@p3)", teamId, level, JsonSerializer.Serialize(next), version + 1); return new { version = version + 1 };
            }
            if (method == "POST")
            {
                Check(Number(body, "board_version", 0) != version, 409, "看板配置已更新，请刷新后重试"); var id = Number(body, "item_id"); var item = Item(me, id, true);
                Check(N(item, "project_id") != project || !InTeam(item, team) || !Levels[level].Contains(S(item, "type")) || N(item, "deleted") == 1, 400, "工作项不属于此看板");
                var col = definition.columns.FirstOrDefault(c => c.id == Text(body, "column_id", 80)); Check(col == null || !col.mappings.ContainsKey(S(item, "type")), 400, "该类型不能移入此列");
                var lane = Text(body, "lane_id", 80); Check(!definition.lanes.Any(l => l.id == lane), 400, "泳道不存在"); var done = Number(body, "column_done", 0, 1); Check(done == 1 && !col!.split, 400, "此列未启用完成分区");
                var saved = (Row)Save(me, project, JsonSerializer.SerializeToElement(new { version = Number(body, "version"), state = col!.mappings[S(item, "type")] }), item);
                db.Run("DELETE FROM board_placements WHERE team_id=@p0 AND level=@p1 AND item_id=@p2", teamId, level, id);
                db.Run("INSERT INTO board_placements(team_id,level,item_id,column_id,lane_id,column_done) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", teamId, level, id, col.id, lane, done);
                // Moving between columns with the same mapped state is still an observable item revision.
                if (N(saved, "version") == N(item, "version")) db.Run("UPDATE items SET version=version+1,changed=@p0 WHERE id=@p1", Now(), id);
                History(id, me, $"看板位置 → {col.name} / {definition.lanes.First(l => l.id == lane).name}" + (done == 1 ? " / Done" : "")); Snapshot(id); return Item(me, id);
            }
        }
        if (p[3] == "reorder" && p.Length == 4 && method == "POST")
        {
            Access(me, project, true); var id = Number(body, "id"); var item = Item(me, id, true); Check(N(item, "project_id") != project || N(item, "deleted") == 1, 400, "工作项不属于该项目"); Check(N(item, "version") != Number(body, "version"), 409, "工作项已更新");
            var before = Reference(body, "before_id"); var all = db.All("SELECT id FROM items WHERE project_id=@p0 AND type=@p1 AND deleted=0 ORDER BY backlog_rank,id", project, item["type"]).Select(r => N(r, "id")).ToList(); all.Remove(id);
            var index = before == null ? all.Count : all.IndexOf(Convert.ToInt64(before)); Check(index < 0, 400, "排序目标必须为同项目、同类型的工作项"); all.Insert(index, id);
            for (var i = 0; i < all.Count; i++) db.Run("UPDATE items SET backlog_rank=@p0 WHERE id=@p1", (i + 1) * 1024L, all[i]);
            db.Run("UPDATE items SET version=version+1,changed=@p0 WHERE id=@p1", Now(), id); History(id, me, "调整待办优先顺序"); return new { ok = true };
        }
        return null;
    }
}
