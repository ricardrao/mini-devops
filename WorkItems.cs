using System.Text.Json;
using Row = System.Collections.Generic.Dictionary<string, object?>;
namespace MiniDevOps;

public sealed record FileDownload(string Name, byte[] Content);
public sealed partial class Api
{
    object ItemDetail(Row me, Row item)
    {
        var id = N(item, "id");
        var links = db.All("SELECT l.*,s.title source_title,t.title target_title,s.project_id source_project_id,t.project_id target_project_id,s.deleted source_deleted,t.deleted target_deleted FROM item_links l JOIN items s ON s.id=l.source_id LEFT JOIN items t ON t.id=l.target_id WHERE (l.source_id=@p0 OR l.target_id=@p0) AND (@p1=1 OR (EXISTS(SELECT 1 FROM members m WHERE m.project_id=s.project_id AND m.user_id=@p2) AND (t.id IS NULL OR EXISTS(SELECT 1 FROM members m WHERE m.project_id=t.project_id AND m.user_id=@p2)))) ORDER BY l.id", id, me["admin"], me["id"]);
        var comments = db.All("SELECT c.*,u.name user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE item_id=@p0 ORDER BY c.id", id);
        foreach (var comment in comments) comment["edits"] = db.All("SELECT body,changed FROM comment_edits WHERE comment_id=@p0 ORDER BY id DESC", comment["id"]);
        const string relatedFields = "SELECT i.id,i.title,i.type,i.state,i.remaining_work,i.changed,i.assignee_id,u.name assignee_name FROM items i LEFT JOIN users u ON u.id=i.assignee_id ";
        return new {
            item, comments,
            history = db.All("SELECT h.*,u.name user_name FROM history h JOIN users u ON u.id=h.user_id WHERE item_id=@p0 ORDER BY h.id DESC", id),
            children = db.All(relatedFields + "WHERE i.parent_id=@p0 AND i.deleted=0 ORDER BY i.backlog_rank,i.id", id),
            parent = item["parent_id"] == null ? null : db.One(relatedFields + "WHERE i.id=@p0 AND i.deleted=0", item["parent_id"]),
            links,
            attachments = db.All("SELECT a.id,a.name,a.size,a.created,u.name user_name FROM attachments a JOIN users u ON u.id=a.user_id WHERE item_id=@p0 ORDER BY a.id", id),
            following = db.One("SELECT 1 FROM follows WHERE user_id=@p0 AND item_id=@p1", me["id"], id) != null
        };
    }
    void Touch(long id, Row me, string message)
    {
        db.Run("UPDATE items SET version=version+1,changed=@p0 WHERE id=@p1", Now(), id); History(id, me, message);
    }
    object? ItemRoutes(HttpContext ctx, JsonElement body, Row me)
    {
        var p = ctx.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries); var method = ctx.Request.Method;
        if (p.Length == 4 && p[1] == "projects" && p[3] is "bulk" or "import" && method == "POST")
        {
            var project = Id(p[2]); Access(me, project, true); Check(!body.TryGetProperty("items", out var values) || values.ValueKind != JsonValueKind.Array || values.GetArrayLength() is < 1 or > 200, 400, "一次可处理 1–200 个工作项");
            var ids = new HashSet<long>(); var results = new List<object>(); var rowNumber = 0;
            foreach (var row in values.EnumerateArray())
            {
                rowNumber++;
                try
                {
                    var id = Number(row, "id", 0); Row? previous = id == 0 ? null : Item(me, id, true);
                    if (previous != null) { Check(N(previous, "project_id") != project || N(previous, "deleted") == 1, 400, "工作项不属于此项目或已删除"); Check(!ids.Add(id), 400, "编号重复"); }
                    JsonElement patch = row;
                    if (p[3] == "bulk")
                    {
                        Check(previous == null, 400, "批量编辑需要已有工作项"); Check(!body.TryGetProperty("changes", out var changes) || changes.ValueKind != JsonValueKind.Object, 400, "缺少更改内容");
                        Check(changes.EnumerateObject().Any(c => !new[] { "state", "assignee_id", "priority", "iteration_id", "tags", "area" }.Contains(c.Name)), 400, "批量编辑字段不支持");
                        var data = changes.EnumerateObject().ToDictionary(c => c.Name, c => (object?)c.Value); data["version"] = Number(row, "version"); patch = JsonSerializer.SerializeToElement(data);
                    }
                    results.Add(Save(me, project, patch, previous));
                }
                catch (ApiException error) { throw new ApiException(error.Status, $"第 {rowNumber} 行：{error.Message}；本批次未保存任何更改"); }
            }
            return new { items = results, count = results.Count };
        }
        if (p.Length < 4 || p[1] != "items") return null;
        var idItem = Id(p[2]); var personal = p[3] is "follow" or "visit"; var item = Item(me, idItem, method != "GET" && !personal);
        if (personal && p.Length == 4 && method == "POST")
        {
            if (p[3] == "follow") { db.Run("DELETE FROM follows WHERE user_id=@p0 AND item_id=@p1", me["id"], idItem); if (Number(body, "following", 0, 1) == 1) db.Run("INSERT INTO follows(user_id,item_id) VALUES(@p0,@p1)", me["id"], idItem); }
            else { db.Run("DELETE FROM visits WHERE user_id=@p0 AND item_id=@p1", me["id"], idItem); db.Run("INSERT INTO visits(user_id,item_id,visited) VALUES(@p0,@p1,@p2)", me["id"], idItem, Now()); }
            return new { ok = true };
        }
        if (p[3] == "clone" && p.Length == 4 && method == "POST")
        {
            Check(N(item, "deleted") == 1, 409, "请先恢复工作项"); var copied = new Row(item); var type = Text(body, "type", 40, true); if (type == "") type = S(item, "type"); Check(!Types.ContainsKey(type), 400, "工作项类型无效");
            var title = Text(body, "title", 300, true); copied["title"] = title == "" ? ("Copy of " + S(item, "title"))[..Math.Min(300, S(item, "title").Length + 8)] : title; copied["type"] = type; copied["state"] = Types[type][0]; copied["parent_id"] = null; copied["completed_work"] = 0; copied["reason"] = "";
            var copy = (Row)Save(me, N(item, "project_id"), JsonSerializer.SerializeToElement(copied), null); var copyId = N(copy, "id");
            db.Run("INSERT INTO item_links(source_id,target_id,kind) VALUES(@p0,@p1,'related')", idItem, copyId); History(copyId, me, "复制自 #" + idItem); Touch(idItem, me, "创建副本 #" + copyId); return copy;
        }
        if (p[3] == "links")
        {
            if (p.Length == 4 && method == "POST")
            {
                Check(N(item, "deleted") == 1 || N(item, "version") != Number(body, "version"), 409, "工作项已更新或删除，请刷新"); var kind = Text(body, "kind", 30); Check(kind is not ("related" or "predecessor" or "successor" or "duplicate" or "hyperlink"), 400, "关联类型无效");
                var label = Text(body, "label", 200, true); var url = ""; long? target = null; var source = idItem;
                if (kind == "hyperlink") { url = Text(body, "url", 2000); Check(!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") || uri.UserInfo != "", 400, "链接必须为不包含账号密码的 HTTP(S) 地址"); }
                else
                {
                    target = Number(body, "target_id"); var other = Item(me, target.Value, true); Check(target == idItem || N(other, "deleted") == 1, 400, "只能关联其他活动工作项");
                    if (kind == "predecessor") { source = target.Value; target = idItem; kind = "dependency"; } else if (kind == "successor") kind = "dependency";
                    if (kind == "related" && source > target) { (source, target) = (target.Value, source); }
                    if (kind is "dependency" or "duplicate")
                    {
                        var edges = db.All("SELECT source_id,target_id FROM item_links WHERE kind=@p0", kind);
                        var stack = new Stack<long>(); var seen = new HashSet<long>(); stack.Push(target!.Value);
                        while (stack.Count > 0) { var next = stack.Pop(); Check(next == source, 400, "关联不能形成循环"); if (seen.Add(next)) foreach (var edge in edges.Where(e => N(e, "source_id") == next)) stack.Push(N(edge, "target_id")); }
                        if (kind == "duplicate") Check(edges.Any(e => N(e, "source_id") == source), 409, "此工作项已经标记为另一个工作项的重复项");
                    }
                    Check(db.One("SELECT id FROM item_links WHERE source_id=@p0 AND target_id=@p1 AND kind=@p2", source, target, kind) != null, 409, "关联已存在");
                }
                var link = db.Insert("INSERT INTO item_links(source_id,target_id,kind,url,label) VALUES(@p0,@p1,@p2,@p3,@p4)", source, target, kind, url, label);
                Touch(idItem, me, "添加关联 " + kind + (target == null ? " " + url : " #" + (source == idItem ? target : source)));
                if (target != null) Touch(source == idItem ? target.Value : source, me, "关联工作项 #" + idItem); return new { id = link };
            }
            if (p.Length == 5 && method == "DELETE")
            {
                Check(N(item, "deleted") == 1 || N(item, "version") != Number(body, "version"), 409, "工作项已更新或删除"); var link = db.One("SELECT * FROM item_links WHERE id=@p0 AND (source_id=@p1 OR target_id=@p1)", Id(p[4]), idItem); Check(link == null, 404, "关联不存在");
                var otherId = N(link!, "source_id") == idItem ? N(link!, "target_id") : N(link!, "source_id"); if (otherId > 0) Item(me, otherId, true);
                db.Run("DELETE FROM item_links WHERE id=@p0", link!["id"]); Touch(idItem, me, "移除关联 " + S(link, "kind")); if (otherId > 0) Touch(otherId, me, "移除与 #" + idItem + " 的关联"); return new { ok = true };
            }
        }
        if (p[3] == "attachments")
        {
            if (p.Length == 4 && method == "POST")
            {
                Check(N(item, "deleted") == 1, 409, "请先恢复工作项"); var name = Text(body, "name", 200); Check(name.Contains('\n') || name.Contains('\r') || name.Contains('/') || name.Contains('\\'), 400, "文件名称无效");
                byte[] bytes; try { bytes = Convert.FromBase64String(Text(body, "content", 3000000)); } catch (FormatException) { throw new ApiException(400, "附件编码无效"); }
                Check(bytes.Length is < 1 or > 2097152, 400, "附件大小为 1 字节–2 MB"); var total = db.One("SELECT COUNT(*) count,COALESCE(SUM(size),0) size FROM attachments WHERE item_id=@p0", idItem)!; Check(N(total, "count") >= 20 || N(total, "size") + bytes.Length > 20 * 1048576, 400, "每个工作项最多 20 个附件、合计 20 MB");
                var id = db.Insert("INSERT INTO attachments(item_id,user_id,name,size,content,created) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", idItem, me["id"], name, bytes.Length, bytes, Now()); Touch(idItem, me, "上传附件 " + name); return new { id };
            }
            if (p.Length == 5)
            {
                var attachment = db.One("SELECT * FROM attachments WHERE id=@p0 AND item_id=@p1", Id(p[4]), idItem); Check(attachment == null, 404, "附件不存在");
                if (method == "GET") return new FileDownload(S(attachment!, "name"), (byte[])attachment!["content"]!);
                if (method == "DELETE") { Check(N(item, "deleted") == 1, 409, "请先恢复工作项"); db.Run("DELETE FROM attachments WHERE id=@p0", attachment!["id"]); Touch(idItem, me, "删除附件 " + S(attachment, "name")); return new { ok = true }; }
            }
        }
        if (p[3] == "comments" && p.Length == 5 && method == "PATCH")
        {
            Check(N(item, "deleted") == 1, 409, "请先恢复工作项"); var comment = db.One("SELECT * FROM comments WHERE id=@p0 AND item_id=@p1", Id(p[4]), idItem);
            Check(comment == null || N(comment, "user_id") != N(me, "id"), 403, "只能编辑自己的评论"); Check(N(comment!, "version") != Number(body, "version"), 409, "评论已更新");
            var text = Text(body, "body", 10000); db.Run("INSERT INTO comment_edits(comment_id,body,changed) VALUES(@p0,@p1,@p2)", comment!["id"], comment["body"], Now());
            db.Run("UPDATE comments SET body=@p0,edited=@p1,version=version+1 WHERE id=@p2", text, Now(), comment["id"]); Touch(idItem, me, "编辑评论"); return new { ok = true };
        }
        return null;
    }
}
