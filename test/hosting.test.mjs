import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from './helpers.mjs';

test('built frontend is served with per-response CSP nonces; source and configuration stay private', async t => {
  const server = await start(); t.after(() => server.stop());
  const page = await fetch(server.base + '/'); const html = await page.text();
  assert.equal(page.status, 200);
  const nonce = html.match(/name="csp-nonce" content="([^"]+)"/)?.[1];
  assert.ok(nonce && nonce !== '__CSP_NONCE__');
  assert.ok(page.headers.get('content-security-policy').includes(`'nonce-${nonce}'`));
  assert.ok(!page.headers.get('content-security-policy').includes('unsafe-inline'));
  const next = await fetch(server.base + '/index.html');
  assert.ok(!(await next.text()).includes(nonce));
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(asset); assert.equal((await fetch(server.base + asset)).status, 200);
  assert.equal((await fetch(server.base + '/legacy-runtime.js')).status, 200);
  for (const path of ['/.env', '/Program.cs', '/src/main.tsx', '/backend/MiniDevOps.Api/Program.cs'])
    assert.equal((await fetch(server.base + path)).status, 404, path);
  assert.equal((await fetch(server.base + '/api/projects')).status, 401);
});
