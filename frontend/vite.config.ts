import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keep the proven DOM screens running while individual features migrate to React.
// This is an external classic script, never eval/inline code. Order is explicit.
const legacyFiles = ['app', 'workitems', 'queries', 'boards', 'azure-ui', 'project-ui',
  'weekly-planning', 'capacity-ui', 'detail-ui', 'sprint-ui', 'reference-ui',
  'delivery-ui', 'nimbus-board', 'team-boards', 'bridge'];
function legacyRuntime(): Plugin {
  const source = () => legacyFiles.map(name => readFileSync(
    fileURLToPath(new URL(`./src/legacy/${name}.js`, import.meta.url)), 'utf8')).join('\n;\n');
  return {
    name: 'mini-devops-legacy-runtime',
    configureServer(server) {
      server.middlewares.use('/legacy-runtime.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(source());
      });
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'legacy-runtime.js', source: source() }); },
  };
}
export default defineConfig({
  plugins: [legacyRuntime()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.DEVOPS_API_URL || 'http://127.0.0.1:3220',
        changeOrigin: true,
        // Browser calls remain same-origin. Forward a matching origin to the API
        // instead of weakening API origin/CSRF validation with permissive CORS.
        configure(proxy) {
          proxy.on('proxyReq', (request, incoming) => {
            if (incoming.headers.origin) request.setHeader('Origin', process.env.DEVOPS_API_URL || 'http://127.0.0.1:3220');
          });
        },
      },
    },
  },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
