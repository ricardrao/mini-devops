using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed partial class Api
{
    object? TeamDirectoryRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var method = ctx.Request.Method;
        if (p.Length < 4 || p[1] != "projects") return null;
        if (p[3] != "boards-directory" && !(p[3] == "teams" && p.Length >= 6)) return null;
        var project = Id(p[2]); Access(me, project);
        if (p[3] == "boards-directory")
        {
            Check(p.Length != 4 || method != "GET", 404, "接口不存在");
            return db.All("""
                SELECT t.id,t.name,t.project_id,
                    CASE WHEN tm.user_id IS NULL THEN 0 ELSE 1 END is_member,
                    COALESCE(bp.favorite,0) favorite,COALESCE(bp.last_visited,'') last_visited
                FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=@p1
                LEFT JOIN board_preferences bp ON bp.team_id=t.id AND bp.user_id=@p1
                WHERE t.project_id=@p0 ORDER BY t.name,t.id
                """, project, me["id"]);
        }
        var teamId = Id(p[4]); var team = Team(project, teamId);
        if (p[5] == "members")
        {
            if (p.Length == 6 && method == "GET") return new { team, members = db.All("SELECT u.id,u.name,u.login FROM users u JOIN team_members tm ON tm.user_id=u.id WHERE tm.team_id=@p0 ORDER BY u.name,u.id", teamId) };
            Check(p.Length != 7 || method is not ("PUT" or "DELETE"), 404, "接口不存在");
            Admin(me); var uid = Id(p[6]);
            if (method == "PUT")
            {
                Check(db.One("SELECT user_id FROM members WHERE project_id=@p0 AND user_id=@p1", project, uid) == null, 400, "请先将该用户加入项目");
                if (db.One("SELECT user_id FROM team_members WHERE team_id=@p0 AND user_id=@p1", teamId, uid) == null)
                    db.Run("INSERT INTO team_members(team_id,user_id) VALUES(@p0,@p1)", teamId, uid);
            }
            else db.Run("DELETE FROM team_members WHERE team_id=@p0 AND user_id=@p1", teamId, uid);
            return new { ok = true };
        }
        Check(p.Length != 6 || !(p[5] == "favorite" && method == "PUT" || p[5] == "visit" && method == "POST"), 404, "接口不存在");
        var previous = db.One("SELECT favorite,last_visited FROM board_preferences WHERE team_id=@p0 AND user_id=@p1", teamId, me["id"]);
        var favorite = previous == null ? 0 : N(previous, "favorite");
        var visited = previous == null ? "" : S(previous, "last_visited");
        if (p[5] == "favorite")
        {
            Check(!body.TryGetProperty("favorite", out var f) || f.ValueKind is not (JsonValueKind.True or JsonValueKind.False), 400, "favorite 必须为布尔值");
            favorite = f.GetBoolean() ? 1 : 0;
        }
        else visited = Now();
        db.Run("DELETE FROM board_preferences WHERE team_id=@p0 AND user_id=@p1", teamId, me["id"]);
        db.Run("INSERT INTO board_preferences(team_id,user_id,favorite,last_visited) VALUES(@p0,@p1,@p2,@p3)", teamId, me["id"], favorite, visited);
        return new { favorite = favorite == 1, last_visited = visited };
    }
}
