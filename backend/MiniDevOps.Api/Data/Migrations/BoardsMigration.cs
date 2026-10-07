using System.Text.Json;
namespace MiniDevOps;

public sealed partial class Store
{
    void UpgradeBoards(long version)
    {
        if (version >= 2) return;
        var id = MySql ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT";
        var text = MySql ? "LONGTEXT" : "TEXT"; var blob = MySql ? "LONGBLOB" : "BLOB";
        // MySQL DDL commits implicitly. Column/table existence checks make an interrupted upgrade resumable.
        void Column(string table, string name, string definition)
        {
            var exists = MySql ? One("SELECT 1 found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=@p0 AND COLUMN_NAME=@p1", table, name) != null : All($"PRAGMA table_info({table})").Any(r => r["name"]?.ToString() == name);
            if (!exists) Exec($"ALTER TABLE {table} ADD COLUMN {name} {definition}");
        }
        foreach (var name in new[] { "remaining_work", "original_estimate", "completed_work" }) Column("items", name, "DECIMAL(12,2) NOT NULL DEFAULT 0");
        Column("items", "backlog_rank", "BIGINT NOT NULL DEFAULT 0");
        Column("items", "blocked", "INTEGER NOT NULL DEFAULT 0"); Column("items", "severity", "INTEGER NOT NULL DEFAULT 3");
        Column("items", "activity", "VARCHAR(80) NOT NULL DEFAULT ''"); Column("items", "reason", "VARCHAR(200) NOT NULL DEFAULT ''");
        Column("items", "target_date", "VARCHAR(10) NOT NULL DEFAULT ''");
        Column("items", "repro_steps", text + " NULL"); Column("items", "system_info", text + " NULL");
        Column("queries", "shared", "INTEGER NOT NULL DEFAULT 0"); Column("queries", "folder", "VARCHAR(200) NOT NULL DEFAULT ''"); Column("queries", "version", "INTEGER NOT NULL DEFAULT 1");
        Column("comments", "version", "INTEGER NOT NULL DEFAULT 1"); Column("comments", "edited", "VARCHAR(40) NULL");
        Exec($"""
            CREATE TABLE IF NOT EXISTS teams(id {id},project_id BIGINT NOT NULL,name VARCHAR(100) NOT NULL,areas {text} NOT NULL,working_days VARCHAR(100) NOT NULL,default_iteration_id BIGINT NULL,UNIQUE(project_id,name),FOREIGN KEY(project_id) REFERENCES projects(id));
            CREATE TABLE IF NOT EXISTS board_configs(team_id BIGINT NOT NULL,level VARCHAR(40) NOT NULL,definition {text} NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(team_id,level),FOREIGN KEY(team_id) REFERENCES teams(id));
            CREATE TABLE IF NOT EXISTS board_placements(team_id BIGINT NOT NULL,level VARCHAR(40) NOT NULL,item_id BIGINT NOT NULL,column_id VARCHAR(80) NOT NULL,lane_id VARCHAR(80) NOT NULL,column_done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(team_id,level,item_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(item_id) REFERENCES items(id));
            CREATE TABLE IF NOT EXISTS follows(user_id BIGINT NOT NULL,item_id BIGINT NOT NULL,PRIMARY KEY(user_id,item_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(item_id) REFERENCES items(id));
            CREATE TABLE IF NOT EXISTS visits(user_id BIGINT NOT NULL,item_id BIGINT NOT NULL,visited VARCHAR(40) NOT NULL,PRIMARY KEY(user_id,item_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(item_id) REFERENCES items(id));
            CREATE TABLE IF NOT EXISTS item_links(id {id},source_id BIGINT NOT NULL,target_id BIGINT NULL,kind VARCHAR(30) NOT NULL,url VARCHAR(2000) NOT NULL DEFAULT '',label VARCHAR(200) NOT NULL DEFAULT '',FOREIGN KEY(source_id) REFERENCES items(id),FOREIGN KEY(target_id) REFERENCES items(id));
            CREATE TABLE IF NOT EXISTS attachments(id {id},item_id BIGINT NOT NULL,user_id BIGINT NOT NULL,name VARCHAR(200) NOT NULL,size INTEGER NOT NULL,content {blob} NOT NULL,created VARCHAR(40) NOT NULL,FOREIGN KEY(item_id) REFERENCES items(id),FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS comment_edits(id {id},comment_id BIGINT NOT NULL,body {text} NOT NULL,changed VARCHAR(40) NOT NULL,FOREIGN KEY(comment_id) REFERENCES comments(id));
            CREATE TABLE IF NOT EXISTS item_revisions(id {id},item_id BIGINT NOT NULL,project_id BIGINT NOT NULL,recorded VARCHAR(40) NOT NULL,snapshot {text} NOT NULL,FOREIGN KEY(item_id) REFERENCES items(id),FOREIGN KEY(project_id) REFERENCES projects(id));
            CREATE TABLE IF NOT EXISTS query_folders(id {id},project_id BIGINT NOT NULL,user_id BIGINT NOT NULL,name VARCHAR(200) NOT NULL,shared INTEGER NOT NULL,FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS query_favorites(user_id BIGINT NOT NULL,query_id BIGINT NOT NULL,PRIMARY KEY(user_id,query_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(query_id) REFERENCES queries(id));
            CREATE TABLE IF NOT EXISTS capacities(team_id BIGINT NOT NULL,iteration_id BIGINT NOT NULL,user_id BIGINT NOT NULL,per_day DECIMAL(6,2) NOT NULL,activity VARCHAR(80) NOT NULL,days_off {text} NOT NULL,PRIMARY KEY(team_id,iteration_id,user_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(iteration_id) REFERENCES iterations(id),FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS team_days_off(team_id BIGINT NOT NULL,iteration_id BIGINT NOT NULL,dates {text} NOT NULL,PRIMARY KEY(team_id,iteration_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(iteration_id) REFERENCES iterations(id));
            """);
        Atomic(() =>
        {
            Run("UPDATE items SET backlog_rank=id*1024 WHERE backlog_rank=0"); Run("UPDATE items SET repro_steps='' WHERE repro_steps IS NULL"); Run("UPDATE items SET system_info='' WHERE system_info IS NULL");
            foreach (var p in All("SELECT id,name FROM projects WHERE NOT EXISTS(SELECT 1 FROM teams WHERE project_id=projects.id)")) Run("INSERT INTO teams(project_id,name,areas,working_days) VALUES(@p0,@p1,'[]','[1,2,3,4,5]')", p["id"], p["name"] + " Team");
            foreach (var item in All("SELECT * FROM items WHERE NOT EXISTS(SELECT 1 FROM item_revisions r WHERE r.item_id=items.id)")) Run("INSERT INTO item_revisions(item_id,project_id,recorded,snapshot) VALUES(@p0,@p1,@p2,@p3)", item["id"], item["project_id"], DateTime.UtcNow.ToString("O"), JsonSerializer.Serialize(item));
            Run("UPDATE devops_schema SET version=2"); return true;
        });
    }
}
