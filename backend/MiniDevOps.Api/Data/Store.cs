using System.Data.Common;
using Microsoft.Data.Sqlite;
using MySqlConnector;

namespace MiniDevOps;

public sealed partial class Store : IDisposable
{
    readonly DbConnection connection;
    DbTransaction? transaction;
    public object Gate { get; } = new();
    public bool MySql { get; }
    public Store(IConfiguration config)
    {
        var provider = config["DEVOPS_DB_PROVIDER"] ?? "sqlite";
        MySql = provider == "mysql";
        if (provider is not ("mysql" or "sqlite")) throw new InvalidOperationException("DEVOPS_DB_PROVIDER must be mysql or sqlite.");
        if (MySql)
        {
            var cs = config["DEVOPS_MYSQL_CONNECTION_STRING"] ?? throw new InvalidOperationException("Set DEVOPS_MYSQL_CONNECTION_STRING.");
            var builder = new MySqlConnectionStringBuilder(cs);
            if (string.IsNullOrWhiteSpace(builder.Database) || new[] { "mysql", "sys", "information_schema", "performance_schema" }.Contains(builder.Database.ToLowerInvariant()))
                throw new InvalidOperationException("Use a dedicated Mini DevOps database.");
            connection = new MySqlConnection(cs);
        }
        else
        {
            var file = Path.GetFullPath(config["DEVOPS_DB_PATH"] ?? "data/devops.db");
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = file, ForeignKeys = true }.ToString());
        }
        connection.Open();
        if (!MySql) Exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;");
        var id = MySql ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT";
        var text = MySql ? "LONGTEXT" : "TEXT";
        Exec($"""
            CREATE TABLE IF NOT EXISTS devops_schema(version INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS users(id {id},login VARCHAR(100) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL,password VARCHAR(300) NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS sessions(token VARCHAR(64) PRIMARY KEY,user_id BIGINT NOT NULL,csrf VARCHAR(100) NOT NULL,expires VARCHAR(40) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS projects(id {id},name VARCHAR(100) NOT NULL UNIQUE,description {text} NOT NULL,created VARCHAR(40) NOT NULL);
            CREATE TABLE IF NOT EXISTS members(project_id BIGINT NOT NULL,user_id BIGINT NOT NULL,role VARCHAR(20) NOT NULL,PRIMARY KEY(project_id,user_id),FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS iterations(id {id},project_id BIGINT NOT NULL,name VARCHAR(100) NOT NULL,start_date VARCHAR(10) NOT NULL,end_date VARCHAR(10) NOT NULL,UNIQUE(project_id,name),FOREIGN KEY(project_id) REFERENCES projects(id));
            CREATE TABLE IF NOT EXISTS items(id {id},project_id BIGINT NOT NULL,title VARCHAR(300) NOT NULL,type VARCHAR(40) NOT NULL,state VARCHAR(40) NOT NULL,assignee_id BIGINT NULL,priority INTEGER NOT NULL,area VARCHAR(200) NOT NULL,tags VARCHAR(1000) NOT NULL,description {text} NOT NULL,acceptance {text} NOT NULL,estimate INTEGER NOT NULL DEFAULT 0,iteration_id BIGINT NULL,parent_id BIGINT NULL,created_by BIGINT NOT NULL,created VARCHAR(40) NOT NULL,changed VARCHAR(40) NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(assignee_id) REFERENCES users(id),FOREIGN KEY(iteration_id) REFERENCES iterations(id),FOREIGN KEY(parent_id) REFERENCES items(id),FOREIGN KEY(created_by) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS comments(id {id},item_id BIGINT NOT NULL,user_id BIGINT NOT NULL,body {text} NOT NULL,created VARCHAR(40) NOT NULL,FOREIGN KEY(item_id) REFERENCES items(id),FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS history(id {id},item_id BIGINT NOT NULL,user_id BIGINT NOT NULL,body {text} NOT NULL,created VARCHAR(40) NOT NULL,FOREIGN KEY(item_id) REFERENCES items(id),FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS queries(id {id},project_id BIGINT NOT NULL,user_id BIGINT NOT NULL,name VARCHAR(100) NOT NULL,filters {text} NOT NULL,FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(user_id) REFERENCES users(id));
            """);
        if (One("SELECT version FROM devops_schema") is null) Run("INSERT INTO devops_schema(version) VALUES(1)");
        var version = Convert.ToInt64(One("SELECT version FROM devops_schema")!["version"]);
        if (version is not (1 or 2 or 3 or 4 or 5)) throw new InvalidOperationException("Unsupported database version.");
        UpgradeBoards(version);
        UpgradeQueries(version);
        if (version < 4)
        {
            Exec($"CREATE TABLE IF NOT EXISTS delivery_plans(id {id},project_id BIGINT NOT NULL,name VARCHAR(100) NOT NULL,description VARCHAR(2000) NOT NULL,definition {text} NOT NULL,version INTEGER NOT NULL DEFAULT 1,changed_by BIGINT NOT NULL,changed VARCHAR(40) NOT NULL,FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(changed_by) REFERENCES users(id));");
            Run("UPDATE devops_schema SET version=4");
        }
        if (version < 5)
        {
            Exec("""
                CREATE TABLE IF NOT EXISTS team_members(team_id BIGINT NOT NULL,user_id BIGINT NOT NULL,PRIMARY KEY(team_id,user_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(user_id) REFERENCES users(id));
                CREATE TABLE IF NOT EXISTS board_preferences(team_id BIGINT NOT NULL,user_id BIGINT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,last_visited VARCHAR(40) NOT NULL DEFAULT '',PRIMARY KEY(team_id,user_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(user_id) REFERENCES users(id));
                """);
            // Legacy projects had one implicit default team. Do not assume membership
            // in any additional team from access to the project alone.
            Run("INSERT INTO team_members(team_id,user_id) SELECT t.id,m.user_id FROM teams t JOIN members m ON m.project_id=t.project_id WHERE t.id=(SELECT MIN(t2.id) FROM teams t2 WHERE t2.project_id=t.project_id) AND NOT EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.id AND tm.user_id=m.user_id)");
            Run("UPDATE devops_schema SET version=5");
        }
    }
    DbCommand Command(string sql, params object?[] args)
    {
        var command = connection.CreateCommand(); command.CommandText = sql; command.Transaction = transaction;
        for (var i = 0; i < args.Length; i++) { var p = command.CreateParameter(); p.ParameterName = "@p" + i; p.Value = args[i] ?? DBNull.Value; command.Parameters.Add(p); }
        return command;
    }
    public void Exec(string sql) { using var c = Command(sql); c.ExecuteNonQuery(); }
    public int Run(string sql, params object?[] args) { using var c = Command(sql, args); return c.ExecuteNonQuery(); }
    public List<Dictionary<string, object?>> All(string sql, params object?[] args)
    {
        using var c = Command(sql, args); using var r = c.ExecuteReader(); var rows = new List<Dictionary<string, object?>>();
        while (r.Read()) { var row = new Dictionary<string, object?>(); for (var i = 0; i < r.FieldCount; i++) row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i); rows.Add(row); }
        return rows;
    }
    public Dictionary<string, object?>? One(string sql, params object?[] args) => All(sql, args).FirstOrDefault();
    public long Insert(string sql, params object?[] args) { Run(sql, args); return Convert.ToInt64(One(MySql ? "SELECT LAST_INSERT_ID() id" : "SELECT last_insert_rowid() id")!["id"]); }
    public T Atomic<T>(Func<T> action)
    {
        lock (Gate)
        {
            // Serialize cross-process mutations as well as requests on this instance.
            if (MySql && Convert.ToInt64(One("SELECT GET_LOCK(CONCAT(DATABASE(),':devops'),10) acquired")!["acquired"]) != 1) throw new InvalidOperationException("Database write lock timed out.");
            try { transaction = connection.BeginTransaction(); try { var value = action(); transaction.Commit(); return value; } finally { transaction.Dispose(); transaction = null; } }
            finally { if (MySql) One("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':devops')) released"); }
        }
    }
    public void Dispose() => connection.Dispose();
}
