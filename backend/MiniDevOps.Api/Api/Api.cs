using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Row = System.Collections.Generic.Dictionary<string, object?>;

namespace MiniDevOps;

public sealed class ApiException(int status, string message) : Exception(message) { public int Status => status; }
public sealed partial class Api(Store db, IConfiguration config)
{
    public static readonly Dictionary<string, string[]> Types = new()
    {
        ["Epic"] = ["New", "Active", "Committed", "Done", "Removed"], ["Feature"] = ["New", "Committed", "Active", "Done", "Removed"],
        ["Product Backlog Item"] = ["New", "Approved", "Active", "Committed", "Done", "Removed"],
        ["Task"] = ["To Do", "In Progress", "Active", "Done", "Removed"],
        ["Bug"] = ["New", "Approved", "Active", "Committed", "In Progress", "In Review", "Resolved", "Done", "Removed"]
    };
    public string SetupToken { get; } = config["DEVOPS_SETUP_TOKEN"] ?? Secret();
    readonly Dictionary<string, (int Count, DateTime Until)> attempts = new();
    static string Now() => DateTime.UtcNow.ToString("O");
    static string Secret() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    static string Digest(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static string Password(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        return Convert.ToBase64String(salt) + ":" + Convert.ToBase64String(Rfc2898DeriveBytes.Pbkdf2(password, salt, 210000, HashAlgorithmName.SHA256, 32));
    }
    static bool Matches(string password, string hash)
    {
        var parts = hash.Split(':'); return CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(parts[1]), Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(parts[0]), 210000, HashAlgorithmName.SHA256, 32));
    }
    static long N(Row row, string key) => Convert.ToInt64(row.GetValueOrDefault(key));
    static string S(Row row, string key) => row.GetValueOrDefault(key)?.ToString() ?? "";
    public static void Check([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(true)] bool condition, int status, string message) { if (condition) throw new ApiException(status, message); }
    static string Text(JsonElement body, string key, int max = 300, bool optional = false)
    {
        if (!body.TryGetProperty(key, out var value)) { Check(!optional, 400, $"缺少 {key}"); return ""; }
        Check(value.ValueKind != JsonValueKind.String, 400, $"{key} 必须是文本");
        var text = value.GetString()!.Trim(); Check((!optional && text.Length == 0) || text.Length > max, 400, $"{key} 长度必须为 {(optional ? 0 : 1)}–{max}"); return text;
    }
    static long Number(JsonElement body, string key, long min = 1, long max = 9007199254740991, long fallback = 0)
    {
        if (!body.TryGetProperty(key, out var value)) return fallback;
        Check(value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out _), 400, $"{key} 必须是整数");
        var n = value.GetInt64(); Check(n < min || n > max, 400, $"{key} 超出范围"); return n;
    }
    static object? Reference(JsonElement body, string key) => !body.TryGetProperty(key, out var v) || v.ValueKind == JsonValueKind.Null ? null : Number(body, key);
    static Row User(Row user) => new() { ["id"] = user["id"], ["name"] = user["name"], ["login"] = user["login"], ["admin"] = N(user, "admin") == 1 };
    void Throttle(HttpContext ctx)
    {
        foreach (var old in attempts.Where(x => x.Value.Until < DateTime.UtcNow).Select(x => x.Key).ToArray()) attempts.Remove(old);
        var key = ctx.Connection.RemoteIpAddress?.ToString() ?? "local";
        Check(attempts.Count > 10000 && !attempts.ContainsKey(key), 429, "请稍后重试");
        var current = attempts.GetValueOrDefault(key, (Count: 0, Until: DateTime.UtcNow.AddMinutes(15)));
        Check(current.Count >= 20, 429, "登录尝试过多，请 15 分钟后重试"); attempts[key] = (current.Count + 1, current.Until);
    }
    Row Session(HttpContext ctx)
    {
        var token = ctx.Request.Cookies["devops_session"];
        var user = token == null ? null : db.One("SELECT u.*,s.csrf FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=@p0 AND s.expires>@p1", Digest(token), Now());
        Check(user == null, 401, "请先登录");
        if (ctx.Request.Method != "GET") Check(ctx.Request.Headers["X-CSRF-Token"].ToString() != S(user!, "csrf"), 403, "会话校验失败，请刷新页面");
        return user!;
    }
    object Login(HttpContext ctx, long id)
    {
        var token = Secret(); var csrf = Secret(); db.Run("DELETE FROM sessions WHERE expires<@p0", Now());
        db.Run("INSERT INTO sessions(token,user_id,csrf,expires) VALUES(@p0,@p1,@p2,@p3)", Digest(token), id, csrf, DateTime.UtcNow.AddHours(12).ToString("O"));
        ctx.Response.Cookies.Append("devops_session", token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = config["DEVOPS_PUBLIC_URL"]?.StartsWith("https://") == true, MaxAge = TimeSpan.FromHours(12), Path = "/" });
        return new { user = User(db.One("SELECT * FROM users WHERE id=@p0", id)!), csrf };
    }
    string Access(Row user, long project, bool write = false)
    {
        Check(db.One("SELECT id FROM projects WHERE id=@p0", project) == null, 404, "项目不存在");
        var role = N(user, "admin") == 1 ? "admin" : db.One("SELECT role FROM members WHERE project_id=@p0 AND user_id=@p1", project, user["id"])?["role"]?.ToString();
        Check(role == null, 404, "项目不存在或无权访问"); Check(write && role == "reader", 403, "只读成员不能修改项目"); return role!;
    }
    void Admin(Row user) => Check(N(user, "admin") != 1, 403, "需要管理员权限");
    static long Id(string text) { Check(!long.TryParse(text, out var id) || id < 1, 400, "编号无效"); return id; }
    Row Item(Row user, long id, bool write = false)
    {
        var item = db.One("SELECT i.*,u.name assignee_name,c.name creator_name FROM items i LEFT JOIN users u ON u.id=i.assignee_id JOIN users c ON c.id=i.created_by WHERE i.id=@p0", id);
        Check(item == null, 404, "工作项不存在"); Access(user, N(item!, "project_id"), write); return item!;
    }
    void History(long item, Row user, string body) => db.Run("INSERT INTO history(item_id,user_id,body,created) VALUES(@p0,@p1,@p2,@p3)", item, user["id"], body, Now());
    long NewUser(JsonElement body, bool admin = false)
    {
        var login = Text(body, "login", 100).ToLowerInvariant(); Check(!Regex.IsMatch(login, @"^[a-z0-9][a-z0-9@._+-]{2,99}$"), 400, "账号至少 3 位，使用字母、数字或邮箱");
        var password = Text(body, "password", 128); Check(password.Length < 12, 400, "密码至少 12 个字符");
        return db.Insert("INSERT INTO users(login,name,password,admin) VALUES(@p0,@p1,@p2,@p3)", login, Text(body, "name", 100), Password(password), admin ? 1 : 0);
    }
    long NewProject(Row user, string name, string description)
    {
        var id = db.Insert("INSERT INTO projects(name,description,created) VALUES(@p0,@p1,@p2)", name, description, Now());
        db.Run("INSERT INTO members(project_id,user_id,role) VALUES(@p0,@p1,'editor')", id, user["id"]);
        var team = db.Insert("INSERT INTO teams(project_id,name,areas,working_days,default_iteration_id) VALUES(@p0,@p1,'[]','[1,2,3,4,5]',NULL)", id, name + " Team");
        db.Run("INSERT INTO team_members(team_id,user_id) VALUES(@p0,@p1)", team, user["id"]); return id;
    }
    public object Handle(HttpContext ctx, JsonElement body)
    {
        var path = ctx.Request.Path.Value!; var method = ctx.Request.Method;
        if (path == "/api/health" && method == "GET") return new { status = "ok", database = db.MySql ? "mysql" : "sqlite", version = "2.1.0" };
        if (path == "/api/setup" && method == "GET") return new { required = db.One("SELECT id FROM users LIMIT 1") == null };
        if (path == "/api/setup" && method == "POST")
        {
            Throttle(ctx); Check(db.One("SELECT id FROM users LIMIT 1") != null, 409, "工作空间已经初始化");
            var local = ctx.Connection.RemoteIpAddress is { } address && System.Net.IPAddress.IsLoopback(address);
            Check(!local && Text(body, "setupToken", 100, true) != SetupToken, 403, "请填写服务启动日志中的设置令牌");
            var id = NewUser(body, true); var user = db.One("SELECT * FROM users WHERE id=@p0", id)!;
            var project = NewProject(user, "My Project", "团队的第一个项目");
            if (body.TryGetProperty("demo", out var demo) && demo.ValueKind == JsonValueKind.True) Seed(user, project);
            return Login(ctx, id);
        }
        if (path == "/api/login" && method == "POST")
        {
            Throttle(ctx); var login = Text(body, "login", 100).ToLowerInvariant(); var password = Text(body, "password", 128);
            var user = db.One("SELECT * FROM users WHERE login=@p0", login);
            var valid = user != null ? Matches(password, S(user, "password")) : Matches(password, Password("dummy-password"));
            Check(user == null || !valid, 401, "账号或密码错误"); return Login(ctx, N(user!, "id"));
        }
        var me = Session(ctx);
        var extra = TeamDirectoryRoutes(ctx, body, me) ?? DeliveryRoutes(ctx, body, me) ?? WeeklyRoutes(ctx, body, me) ?? ProjectRoutes(ctx, body, me) ?? BoardRoutes(ctx, body, me) ?? QueryRoutes(ctx, body, me) ?? PlanningRoutes(ctx, body, me) ?? ItemRoutes(ctx, body, me);
        if (extra != null) return extra;
        if (path == "/api/me" && method == "GET") return new { user = User(me), csrf = me["csrf"], types = Types };
        if (path == "/api/logout" && method == "POST") { db.Run("DELETE FROM sessions WHERE token=@p0", Digest(ctx.Request.Cookies["devops_session"]!)); ctx.Response.Cookies.Delete("devops_session"); return new { ok = true }; }
        if (path == "/api/password" && method == "POST")
        {
            Check(!Matches(Text(body, "current", 128), S(me, "password")), 400, "当前密码不正确"); var password = Text(body, "password", 128); Check(password.Length < 12, 400, "新密码至少 12 个字符");
            db.Run("UPDATE users SET password=@p0 WHERE id=@p1", Password(password), me["id"]); db.Run("DELETE FROM sessions WHERE user_id=@p0", me["id"]); return Login(ctx, N(me, "id"));
        }
        if (path == "/api/users")
        {
            Admin(me); if (method == "GET") return db.All("SELECT id,login,name,admin FROM users ORDER BY name");
            if (method == "POST") return new { id = NewUser(body) };
        }
        if (path == "/api/projects")
        {
            if (method == "GET") return db.All("SELECT p.* FROM projects p WHERE @p0=1 OR EXISTS(SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=@p1) ORDER BY p.name", me["admin"], me["id"]);
            if (method == "POST") { Admin(me); return new { id = NewProject(me, Text(body, "name", 100), Text(body, "description", 2000, true)) }; }
        }
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3 && parts[1] == "projects")
        {
            var project = Id(parts[2]); var role = Access(me, project, method != "GET" && !(parts.Length >= 4 && parts[3] == "queries"));
            if (parts.Length == 3 && method == "GET") return new { project = db.One("SELECT * FROM projects WHERE id=@p0", project), role, members = db.All("SELECT u.id,u.name,u.login,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=@p0 ORDER BY u.name", project), iterations = db.All("SELECT * FROM iterations WHERE project_id=@p0 ORDER BY start_date,id", project), queries = ProjectQueries(me, project), teams = db.All("SELECT * FROM teams WHERE project_id=@p0 ORDER BY id", project), types = Types };
            if (parts.Length == 4 && parts[3] == "members" && method == "POST")
            {
                Admin(me); var uid = Number(body, "user_id"); var memberRole = Text(body, "role", 20); Check(memberRole is not ("reader" or "editor"), 400, "成员角色无效");
                Check(db.One("SELECT id FROM users WHERE id=@p0", uid) == null, 400, "用户不存在");
                db.Run("DELETE FROM members WHERE project_id=@p0 AND user_id=@p1", project, uid); db.Run("INSERT INTO members(project_id,user_id,role) VALUES(@p0,@p1,@p2)", project, uid, memberRole); return new { ok = true };
            }
            if (parts.Length == 5 && parts[3] == "members" && method == "DELETE")
            {
                Admin(me); var uid = Id(parts[4]);
                foreach (var affected in db.All("SELECT id FROM items WHERE project_id=@p0 AND assignee_id=@p1", project, uid)) History(N(affected, "id"), me, "负责人被移出项目，工作项变为未分配");
                db.Run("UPDATE items SET assignee_id=NULL,version=version+1,changed=@p0 WHERE project_id=@p1 AND assignee_id=@p2", Now(), project, uid);
                db.Run("DELETE FROM team_members WHERE user_id=@p0 AND team_id IN (SELECT id FROM teams WHERE project_id=@p1)", uid, project);
                db.Run("DELETE FROM board_preferences WHERE user_id=@p0 AND team_id IN (SELECT id FROM teams WHERE project_id=@p1)", uid, project);
                db.Run("DELETE FROM members WHERE project_id=@p0 AND user_id=@p1", project, uid); return new { ok = true };
            }
            if (parts.Length == 4 && parts[3] == "iterations" && method == "POST")
            {
                var start = Text(body, "start_date", 10); var end = Text(body, "end_date", 10);
                Check(!DateOnly.TryParseExact(start, "yyyy-MM-dd", out var from) || !DateOnly.TryParseExact(end, "yyyy-MM-dd", out _) || string.CompareOrdinal(end, start) < 0, 400, "迭代起止日期无效");
                return new { id = db.Insert("INSERT INTO iterations(project_id,name,start_date,end_date) VALUES(@p0,@p1,@p2,@p3)", project, Text(body, "name", 100), start, end) };
            }
            if (parts.Length == 4 && parts[3] == "queries" && method == "POST")
            {
                var filters = Text(body, "filters", 4000); try { using var doc = JsonDocument.Parse(filters); Check(doc.RootElement.ValueKind != JsonValueKind.Object, 400, "查询格式无效"); } catch (JsonException) { throw new ApiException(400, "查询格式无效"); }
                return new { id = db.Insert("INSERT INTO queries(project_id,user_id,name,filters) VALUES(@p0,@p1,@p2,@p3)", project, me["id"], Text(body, "name", 100), filters) };
            }
            if (parts.Length == 5 && parts[3] == "queries" && method == "DELETE") { db.Run("DELETE FROM queries WHERE id=@p0 AND project_id=@p1 AND user_id=@p2", Id(parts[4]), project, me["id"]); return new { ok = true }; }
            if (parts.Length == 4 && parts[3] == "items")
            {
                if (method == "GET") return List(me, project, ctx.Request.Query);
                if (method == "POST") return Save(me, project, body, null);
            }
        }
        if (parts.Length >= 3 && parts[1] == "items")
        {
            var id = Id(parts[2]); var item = Item(me, id, method != "GET");
            if (parts.Length == 3 && method == "GET") return ItemDetail(me, item);
            if (parts.Length == 3 && method == "PATCH") { Check(N(item, "deleted") == 1, 409, "请先恢复工作项"); return Save(me, N(item, "project_id"), body, item); }
            if (parts.Length == 3 && method == "DELETE" || parts.Length == 4 && parts[3] == "restore" && method == "POST")
            {
                var deleted = method == "DELETE" ? 1 : 0; Check(N(item, "version") != Number(body, "version"), 409, "工作项已被更新，请刷新后重试");
                if (deleted == 1) Check(db.One("SELECT id FROM items WHERE parent_id=@p0 AND deleted=0 LIMIT 1", id) != null, 409, "请先移除或删除子工作项");
                if (deleted == 0 && item["parent_id"] != null) Check(db.One("SELECT id FROM items WHERE id=@p0 AND deleted=0", item["parent_id"]) == null, 409, "请先恢复父工作项");
                db.Run("UPDATE items SET deleted=@p0,version=version+1,changed=@p1 WHERE id=@p2", deleted, Now(), id); History(id, me, deleted == 1 ? "移入回收站" : "恢复工作项"); Snapshot(id); return new { ok = true };
            }
            if (parts.Length == 4 && parts[3] == "comments" && method == "POST")
            {
                Check(N(item, "deleted") == 1, 409, "请先恢复工作项");
                Check(Number(body, "version") != N(item, "version"), 409, "工作项已更新，请复制未保存的内容并重新打开");
                var comment = Text(body, "body", 10000);
                db.Insert("INSERT INTO comments(item_id,user_id,body,created) VALUES(@p0,@p1,@p2,@p3)", id, me["id"], comment, Now());
                db.Run("UPDATE items SET changed=@p0,version=version+1 WHERE id=@p1", Now(), id); return new { ok = true, version = N(item, "version") + 1 };
            }
        }
        throw new ApiException(404, "接口不存在");
    }
    object List(Row me, long project, IQueryCollection query, long[]? projects = null)
    {
        var args = (projects ?? [project]).Cast<object?>().ToList(); var where = new List<string> { "i.project_id IN (" + string.Join(',', args.Select((_, i) => "@p" + i)) + ")" };
        void Filter(string clause, object value) { where.Add(clause.Replace("?", "@p" + args.Count)); args.Add(value); }
        Filter("i.deleted=?", query["view"] == "recycle" ? 1 : 0);
        if (query["view"] == "mine") Filter("i.assignee_id=?", me["id"]!);
        if (query["view"] == "created") Filter("i.created_by=?", me["id"]!);
        if (query["view"] == "following") Filter("EXISTS(SELECT 1 FROM follows f WHERE f.item_id=i.id AND f.user_id=?)", me["id"]!);
        if (query["view"] == "recent") Filter("EXISTS(SELECT 1 FROM visits v WHERE v.item_id=i.id AND v.user_id=?)", me["id"]!);
        if (query["view"] != "recycle" && query["include_completed"] != "true" && string.IsNullOrEmpty(query["state"])) where.Add(query["view"] == "mine" ? "i.state NOT IN ('Done','Removed')" : "i.state!='Removed'");
        if (!string.IsNullOrEmpty(query["team_id"])) AddTeamFilter(project, Id(query["team_id"]!), where, args);
        if (!string.IsNullOrEmpty(query["clauses"])) AddClauses(query["clauses"]!, me, where, args);
        foreach (var field in new[] { "type", "state", "area" }) if (!string.IsNullOrEmpty(query[field])) Filter("i." + field + "=?", query[field].ToString());
        foreach (var field in new[] { "assignee_id", "iteration_id" }) if (!string.IsNullOrEmpty(query[field])) { var value = query[field].ToString(); if (value == "0") where.Add("i." + field + " IS NULL"); else Filter("i." + field + "=?", Id(value)); }
        if (!string.IsNullOrEmpty(query["q"]))
        {
            where.Add($"(LOWER(i.title) LIKE @p{args.Count} OR CAST(i.id AS CHAR)=@p{args.Count + 1})");
            args.Add("%" + query["q"].ToString().ToLowerInvariant() + "%"); args.Add(query["q"].ToString());
        }
        if (!string.IsNullOrEmpty(query["tag"])) Filter("LOWER(i.tags) LIKE ?", "%" + query["tag"].ToString().ToLowerInvariant() + "%");
        var sql = string.Join(" AND ", where); var total = Convert.ToInt64(db.One("SELECT COUNT(*) total FROM items i WHERE " + sql, args.ToArray())!["total"]);
        int.TryParse(query["offset"], out var offset); int.TryParse(query["limit"], out var limit); offset = Math.Max(0, offset); limit = limit == 0 ? 100 : Math.Clamp(limit, 1, 500);
        var sort = query["sort"].ToString(); if (!new[] { "id", "title", "state", "type", "priority", "changed", "backlog_rank" }.Contains(sort)) sort = "changed";
        var direction = query["dir"] == "asc" ? "ASC" : "DESC";
        var rows = db.All($"SELECT i.*,p.name project_name,u.name assignee_name,(SELECT COUNT(*) FROM comments c WHERE c.item_id=i.id) comment_count,(SELECT COUNT(*) FROM items ch WHERE ch.parent_id=i.id AND ch.deleted=0) child_count,(SELECT COUNT(*) FROM items ch WHERE ch.parent_id=i.id AND ch.deleted=0 AND ch.state='Done') child_done FROM items i JOIN projects p ON p.id=i.project_id LEFT JOIN users u ON u.id=i.assignee_id WHERE {sql} ORDER BY i.{sort} {direction},i.id DESC LIMIT {limit} OFFSET {offset}", args.ToArray());
        return new { items = rows, total, offset, limit };
    }
    object Save(Row me, long project, JsonElement patch, Row? previous)
    {
        var values = previous == null ? new Dictionary<string, object?>() : new Dictionary<string, object?>(previous);
        foreach (var property in patch.EnumerateObject()) values[property.Name] = property.Value;
        var body = JsonSerializer.SerializeToElement(values);
        var title = Text(body, "title"); var type = Text(body, "type", 40); Check(!Types.ContainsKey(type), 400, "工作项类型无效");
        var state = Text(body, "state", 40, true); if (state == "") state = Types[type][0];
        Check(!Types[type].Contains(state) && !(previous != null && S(previous, "type") == type && S(previous, "state") == state), 400, "此类型不支持所选状态");
        var assignee = Reference(body, "assignee_id"); var iteration = Reference(body, "iteration_id"); var parent = Reference(body, "parent_id");
        if (assignee != null) Check(db.One("SELECT user_id FROM members WHERE project_id=@p0 AND user_id=@p1", project, assignee) == null, 400, "负责人必须是项目成员");
        if (iteration != null) Check(db.One("SELECT id FROM iterations WHERE id=@p0 AND project_id=@p1", iteration, project) == null, 400, "迭代不属于该项目");
        if (parent != null)
        {
            var current = parent; var seen = new HashSet<long>();
            while (current != null)
            {
                var id = Convert.ToInt64(current); Check(!seen.Add(id) || previous != null && id == N(previous, "id"), 400, "父子关系不能形成循环");
                var linked = db.One("SELECT id,parent_id FROM items WHERE id=@p0 AND project_id=@p1 AND deleted=0", id, project); Check(linked == null, 400, "父工作项不存在或不属于该项目"); current = linked!["parent_id"];
            }
        }
        var data = new Row { ["title"] = title, ["type"] = type, ["state"] = state, ["assignee_id"] = assignee, ["iteration_id"] = iteration, ["parent_id"] = parent,
            ["priority"] = Number(body, "priority", 1, 4, 2), ["estimate"] = Number(body, "estimate", 0, 100000, 0), ["area"] = Text(body, "area", 200, true),
            ["tags"] = string.Join("; ", Text(body, "tags", 1000, true).Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct()),
            ["description"] = Text(body, "description", 20000, true), ["acceptance"] = Text(body, "acceptance", 20000, true),
            ["remaining_work"] = Decimal(body, "remaining_work"), ["original_estimate"] = Decimal(body, "original_estimate"), ["completed_work"] = Decimal(body, "completed_work"),
            ["activity"] = Text(body, "activity", 80, true), ["reason"] = Text(body, "reason", 200, true), ["repro_steps"] = Text(body, "repro_steps", 20000, true),
            ["system_info"] = Text(body, "system_info", 4000, true), ["blocked"] = Number(body, "blocked", 0, 1), ["severity"] = Number(body, "severity", 1, 4, 3),
            ["target_date"] = OptionalDate(body, "target_date") };
        if (state == "Done") data["remaining_work"] = 0m;
        long item;
        if (previous == null)
        {
            data["project_id"] = project; data["created_by"] = me["id"]; data["created"] = Now(); data["changed"] = Now();
            item = db.Insert($"INSERT INTO items({string.Join(',', data.Keys)}) VALUES({string.Join(',', data.Keys.Select((_, i) => "@p" + i))})", data.Values.ToArray()); History(item, me, "创建工作项");
            db.Run("UPDATE items SET backlog_rank=@p0 WHERE id=@p1", item * 1024, item);
        }
        else
        {
            Check(Number(patch, "version") != N(previous, "version"), 409, "工作项已被其他人更新，请重新打开后再保存"); item = N(previous, "id");
            var changes = data.Where(pair => (pair.Value?.ToString() ?? "") != S(previous, pair.Key)).Select(pair => pair.Key is "description" or "acceptance" ? pair.Key + " 已更新" : pair.Key + ": " + S(previous, pair.Key) + " → " + (pair.Value ?? "未设置")).ToArray();
            if (changes.Length > 0)
            {
                data["changed"] = Now(); var args = data.Values.Concat(new object?[] { item }).ToArray();
                db.Run($"UPDATE items SET {string.Join(',', data.Keys.Select((key, i) => key + "=@p" + i))},version=version+1 WHERE id=@p{data.Count}", args); History(item, me, string.Join("\n", changes));
                if (S(previous, "state") != state || S(previous, "type") != type) db.Run("DELETE FROM board_placements WHERE item_id=@p0", item);
            }
        }
        Snapshot(item); return Item(me, item);
    }
    void Seed(Row user, long project)
    {
        var iteration = db.Insert("INSERT INTO iterations(project_id,name,start_date,end_date) VALUES(@p0,'Sprint 1',@p1,@p2)", project, DateTime.Today.ToString("yyyy-MM-dd"), DateTime.Today.AddDays(13).ToString("yyyy-MM-dd"));
        var samples = new[] {
            ("打造团队协作工作空间", "Epic", "Active", "体验; 规划"), ("工作项与状态看板", "Feature", "Active", "Boards"),
            ("支持按负责人和标签筛选工作项", "Product Backlog Item", "Active", "体验; 筛选"), ("设计迭代计划与任务拆分", "Product Backlog Item", "New", "Sprint"),
            ("完善新成员上手指南", "Task", "To Do", "文档"), ("优化窄屏下的工作项详情", "Bug", "In Progress", "体验; 移动端"),
            ("为项目配置只读成员", "Task", "Done", "权限"), ("整理第一轮用户反馈", "Task", "In Progress", "反馈"),
            ("评审下一个版本的验收标准", "Task", "To Do", "规划"), ("验证筛选结果在刷新后保持", "Bug", "Resolved", "筛选") };
        // Sample hierarchy uses Epic > Feature > backlog item > Task/Bug.
        // Link validation itself remains type-independent, as in Azure Boards.
        var created = new List<long>();
        int?[] parentIndexes = [null, 0, 1, 1, 3, 3, 3, 3, 3, 2];
        foreach (var (title, type, state, tags) in samples)
        {
            long? parent = parentIndexes[created.Count] is int index ? created[index] : null;
            var item = (Row)Save(user, project, JsonSerializer.SerializeToElement(new { title, type, state, tags, assignee_id = user["id"], area = "My Project\\Product", iteration_id = iteration, priority = 2, estimate = type == "Task" ? 2 : 5, parent_id = parent, description = "这是一条示例工作项。可以修改内容，或在回收站中管理不再需要的条目。", acceptance = "完成实现并通过验收。" }), null);
            created.Add(N(item, "id"));
        }
    }
}
