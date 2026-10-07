using MiniDevOps;


var contentRoot = AppPaths.ContentRoot();
var envFile = Path.Combine(contentRoot, ".env");
if (File.Exists(envFile)) foreach (var line in File.ReadLines(envFile))
{
    var value = line.Trim(); if (value.Length == 0 || value.StartsWith('#')) continue;
    var split = value.IndexOf('='); if (split < 1) continue;
    var key = value[..split].Trim(); var data = value[(split + 1)..].Trim();
    if (data.Length >= 2 && data[0] == data[^1] && data[0] is '\'' or '"') data = data[1..^1];
    if (Environment.GetEnvironmentVariable(key) == null) Environment.SetEnvironmentVariable(key, data);
}
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = contentRoot, WebRootPath = AppPaths.WebRoot(contentRoot) });
builder.Configuration["DEVOPS_DB_PATH"] ??= Path.Combine(contentRoot, "data", "devops.db");
builder.WebHost.UseUrls(builder.Configuration["DEVOPS_URL"] ?? "http://127.0.0.1:3220");
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 4 * 1048576);
using var store = new Store(builder.Configuration);
var api = new Api(store, builder.Configuration);
var app = builder.Build();
app.UseMiniDevOpsApi(api, store, builder.Configuration);
app.UseMiniDevOpsFrontend(builder.Environment.WebRootPath);

if (store.One("SELECT id FROM users LIMIT 1") is null) Console.WriteLine("Mini DevOps 首次设置令牌（远程首次设置需要）: " + api.SetupToken);
await app.RunAsync();
