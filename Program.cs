using MiniDevOps;
using System.Text.Json;

if (File.Exists(".env")) foreach (var line in File.ReadLines(".env"))
{
    var value = line.Trim(); if (value.Length == 0 || value.StartsWith('#')) continue;
    var split = value.IndexOf('='); if (split < 1) continue;
    var key = value[..split].Trim(); var data = value[(split + 1)..].Trim();
    if (data.Length >= 2 && data[0] == data[^1] && data[0] is '\'' or '"') data = data[1..^1];
    if (Environment.GetEnvironmentVariable(key) == null) Environment.SetEnvironmentVariable(key, data);
}
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(builder.Configuration["DEVOPS_URL"] ?? "http://127.0.0.1:3220");
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 4 * 1048576);
using var store = new Store(builder.Configuration);
var api = new Api(store, builder.Configuration);
var app = builder.Build();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "same-origin";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.Headers.CacheControl = "no-store";
        try
        {
            var host = ctx.Request.Host.Host;
            var publicUrl = builder.Configuration["DEVOPS_PUBLIC_URL"];
            Api.Check(host is not ("localhost" or "127.0.0.1" or "::1") && (publicUrl == null || new Uri(publicUrl).Authority != ctx.Request.Host.Value), 421, "请配置 DEVOPS_PUBLIC_URL");
            if (ctx.Request.Headers.Origin.Count > 0)
            {
                var expected = publicUrl?.TrimEnd('/') ?? $"{ctx.Request.Scheme}://{ctx.Request.Host}";
                Api.Check(ctx.Request.Headers.Origin.ToString() != expected, 403, "请求来源不允许");
            }
            JsonElement body = JsonSerializer.SerializeToElement(new { });
            if (ctx.Request.ContentLength > 0 || ctx.Request.Headers.ContainsKey("Transfer-Encoding"))
            {
                using var doc = await JsonDocument.ParseAsync(ctx.Request.Body, cancellationToken: ctx.RequestAborted);
                body = doc.RootElement.Clone(); Api.Check(body.ValueKind != JsonValueKind.Object, 400, "请求必须为 JSON 对象");
            }
            object result;
            lock (store.Gate) result = ctx.Request.Method is "GET" or "HEAD" ? api.Handle(ctx, body) : store.Atomic(() => api.Handle(ctx, body));
            if (result is FileDownload file)
            {
                ctx.Response.ContentType = "application/octet-stream";
                ctx.Response.Headers.ContentDisposition = "attachment; filename=attachment; filename*=UTF-8''" + Uri.EscapeDataString(file.Name);
                await ctx.Response.Body.WriteAsync(file.Content);
            }
            else await ctx.Response.WriteAsJsonAsync(result);
        }
        catch (Exception error)
        {
            var status = error switch { ApiException e => e.Status, JsonException => 400, BadHttpRequestException e => e.StatusCode, MySqlConnector.MySqlException e when e.Number == 1062 => 409, Microsoft.Data.Sqlite.SqliteException e when e.SqliteExtendedErrorCode is 2067 or 1555 => 409, _ => 500 };
            if (status == 500) app.Logger.LogError(error, "API request failed");
            ctx.Response.StatusCode = status;
            await ctx.Response.WriteAsJsonAsync(new { error = status == 500 ? "服务暂时不可用" : status == 409 && error is not ApiException ? "名称或账号已存在" : error is JsonException ? "JSON 格式错误" : error.Message });
        }
        return;
    }
    await next();
});
app.UseDefaultFiles(); app.UseStaticFiles();
if (store.One("SELECT id FROM users LIMIT 1") is null) Console.WriteLine("Mini DevOps 首次设置令牌（远程首次设置需要）: " + api.SetupToken);
await app.RunAsync();
