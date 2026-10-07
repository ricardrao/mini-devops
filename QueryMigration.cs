namespace MiniDevOps;

public sealed partial class Store
{
    void UpgradeQueries(long version)
    {
        if (version >= 3) return;
        // Nullable legacy values preserve the distinction between unknown history and a new edit.
        foreach (var table in new[] { "queries", "query_folders" })
        foreach (var (name, definition) in new[] { ("changed_by", "BIGINT NULL"), ("changed", "VARCHAR(40) NULL") })
        {
            var exists = MySql
                ? One("SELECT 1 found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=@p0 AND COLUMN_NAME=@p1", table, name) != null
                : All($"PRAGMA table_info({table})").Any(r => r["name"]?.ToString() == name);
            if (!exists) Exec($"ALTER TABLE {table} ADD COLUMN {name} {definition}");
        }
        Run("UPDATE devops_schema SET version=3");
    }
}
