import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
export const root = path.resolve(import.meta.dirname, '..');
export const dotnet = process.env.DEVOPS_DOTNET || (existsSync(path.resolve(root, '../mini-icm/.runtime/dotnet/dotnet.exe')) ? path.resolve(root, '../mini-icm/.runtime/dotnet/dotnet.exe') : 'dotnet');
export async function start(options = {}) {
  const directory = options.directory || mkdtempSync(path.join(os.tmpdir(), 'mini-devops-test-'));
  const processEnv = { ...process.env, DEVOPS_DB_PROVIDER: 'sqlite', DEVOPS_DB_PATH: path.join(directory, 'devops.db'), DEVOPS_URL: 'http://127.0.0.1:0', DEVOPS_SETUP_TOKEN: 'test-setup-token', ...options.env };
  const child = spawn(dotnet, ['backend/MiniDevOps.Api/bin/Debug/net10.0/MiniDevOps.dll'], { cwd: root, env: processEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const match = logs.match(/Now listening on: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) return { base: match[1], directory, logs: () => logs, async stop() { if (child.exitCode === null && child.signalCode === null) { const done = once(child, 'exit'); child.kill(); await done; } } };
    if (child.exitCode !== null) throw Error(logs);
    await new Promise(r => setTimeout(r, 50));
  }
  child.kill(); throw Error('Startup timeout: ' + logs);
}
export function client(base) {
  let cookie = '', csrf = '';
  return { get csrf() { return csrf; }, async request(path, method = 'GET', body, options = {}) {
    const headers = { Cookie: cookie, ...options.headers };
    if (method !== 'GET' && !options.noCsrf) headers['X-CSRF-Token'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + '/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); const session = response.headers.get('set-cookie'); if (session) cookie = session.split(';')[0]; if (data.csrf) csrf = data.csrf;
    if (options.status) { if (response.status !== options.status) throw Error(`${method} ${path}: expected ${options.status}, got ${response.status}: ${JSON.stringify(data)}`); }
    else if (!response.ok) throw Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  } };
}
