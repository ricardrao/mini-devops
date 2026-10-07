import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { start, root } from './helpers.mjs';

const api = await start();
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174'], {
  cwd: path.join(root, 'frontend'), env: { ...process.env, DEVOPS_API_URL: api.base }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; vite.stdout.on('data', b => logs += b); vite.stderr.on('data', b => logs += b);
const base = 'http://127.0.0.1:5174';
try {
  const deadline = Date.now() + 15000;
  while (!logs.includes('5174') && Date.now() < deadline && vite.exitCode === null) await new Promise(r => setTimeout(r, 100));
  assert.equal(vite.exitCode, null, logs);
  const page = await fetch(base); assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('/src/main.tsx'));
  assert.equal((await fetch(base + '/legacy-runtime.js')).status, 200);
  const setup = await fetch(base + '/api/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ login: 'proxy-admin', password: 'Proxy-test-password-2026', name: 'Proxy test', demo: false }),
  });
  assert.equal(setup.status, 200, await setup.clone().text());
  const session = await setup.json(); const cookie = setup.headers.get('set-cookie').split(';')[0];
  const projects = await fetch(base + '/api/projects', { headers: { Cookie: cookie } });
  assert.equal(projects.status, 200);
  const create = csrf => fetch(base + '/api/projects', {
    method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ name: 'Proxy created project' }),
  });
  assert.equal((await create('invalid')).status, 403, 'proxy preserves CSRF enforcement');
  const created = await create(session.csrf); assert.equal(created.status, 200, await created.clone().text());
  console.log('Frontend dev proxy: setup, cookie session, project API and CSRF checks passed.');
} finally {
  if (vite.exitCode === null) { const done = once(vite, 'exit'); vite.kill(); await done; }
  await api.stop();
}
