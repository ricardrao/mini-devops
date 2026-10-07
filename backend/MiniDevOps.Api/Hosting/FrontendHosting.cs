namespace MiniDevOps;

public static class FrontendHosting
{
    public static void UseMiniDevOpsFrontend(this WebApplication app, string webRoot)
    {
        async Task Index(HttpContext context)
        {
            var index = Path.Combine(webRoot, "index.html");
            if (!File.Exists(index)) { context.Response.StatusCode = 404; return; }
            var html = await File.ReadAllTextAsync(index, context.RequestAborted);
            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsync(html.Replace("__CSP_NONCE__", context.Items["CspNonce"]?.ToString()), context.RequestAborted);
        }
        app.Use(async (context, next) =>
        {
            if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method)) && context.Request.Path.Value is "/" or "/index.html")
                await Index(context);
            else await next();
        });
        app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = context =>
            {
                context.Context.Response.Headers.CacheControl = context.Context.Request.Path.StartsWithSegments("/assets")
                    && context.File.Name.Contains('-') ? "public,max-age=31536000,immutable" : "no-cache";
            }
        });
        app.MapFallback(Index);
    }
}
