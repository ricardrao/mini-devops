namespace MiniDevOps;

public static class AppPaths
{
    public static string ContentRoot()
    {
        if (Environment.GetEnvironmentVariable("DEVOPS_CONTENT_ROOT") is { Length: > 0 } root)
            return Path.GetFullPath(root);
        for (var directory = new DirectoryInfo(Directory.GetCurrentDirectory()); directory != null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "frontend", "package.json")) && Directory.Exists(Path.Combine(directory.FullName, "backend")))
                return directory.FullName;
        return Directory.GetCurrentDirectory();
    }

    public static string WebRoot(string contentRoot)
    {
        var published = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (File.Exists(Path.Combine(published, "index.html"))) return published;
        var frontend = Path.Combine(contentRoot, "frontend", "dist");
        return File.Exists(Path.Combine(frontend, "index.html")) ? frontend : published;
    }
}
