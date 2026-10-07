using System.Text.Json;
namespace MiniDevOps;
public static class ApiPipeline
{
    public static void UseMiniDevOpsApi(this WebApplication app, Api api, Store store, IConfiguration configuration)
    {
        app.Use(async (ctx, next) =>
        {
            var nonce = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
            ctx.Items["CspNonce"] = nonce;
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            ctx.Response.Headers["X-Frame-Options"] = "DENY";
            ctx.Response.Headers["Referrer-Policy"] = "same-origin";
            ctx.Response.Headers["Content-Security-Policy"] = $"default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{nonce}'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.Headers.CacheControl = "no-store";
                try
                {
                    var host = ctx.Request.Host.Host;
                    var publicUrl = configuration["DEVOPS_PUBLIC_URL"];
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
    }
}
