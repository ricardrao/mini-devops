import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { start, root } from './helpers.mjs';

const server = {base:process.env.DEVOPS_REVIEW_URL || 'http://localhost:3220',stop:async()=>{},logs:()=>''};
const directory = mkdtempSync(path.join(os.tmpdir(), 'mini-devops-browser-'));
const out = path.join(root, 'test-results'); mkdirSync(out, { recursive: true });
const browser = spawn(process.env.DEVOPS_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(action, description, timeout = 15000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { const result = await action(); if (result) return result; } catch (e) { last = e; } await delay(75); } throw Error(`Timeout: ${description} ${last || ''}`); }
let socket, sequence = 0; const pending = new Map(), errors = [];
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 15000); pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; }
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const has = text => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
const submit = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
async function shot(name) { const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(path.join(out, name), Buffer.from(result.data, 'base64')); }
async function navigate(page) { await evaluate(`go(${JSON.stringify(page)},{view:'all'})`); await until(() => evaluate(`state.page===${JSON.stringify(page)} && document.title.startsWith(names[${JSON.stringify(page)}]+' ·') && !document.querySelector('#page-content .loading')`), page); }
try {
  await until(() => existsSync(path.join(directory, 'DevToolsActivePort')), 'browser startup');
  const port = readFileSync(path.join(directory, 'DevToolsActivePort'), 'utf8').split('\n')[0]; const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id) { const call = pending.get(data.id); if (call) { pending.delete(data.id); data.error ? call.reject(Error(data.error.message)) : call.resolve(data.result); } } else if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text); else if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error' && !data.params.entry.text.includes('401')) errors.push(data.params.entry.text); });
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  await command('Page.navigate',{url:server.base}); await until(()=>has('欢迎回来'),'login');
  await fill('[name=login]',process.env.DEVOPS_SEED_LOGIN);await fill('[name=password]',process.env.DEVOPS_SEED_PASSWORD);await submit('#auth-form');
  await until(()=>evaluate('!!document.querySelector("tr[data-row]")'),'populated work list');
  await evaluate("go('workitems',{project:'1',view:'all'})");await until(()=>evaluate('state.project===1 && !!document.querySelector("tr[data-row]")'),'review project');



  for(const page of ['workitems','board','backlog','queries','sprints']){await navigate(page);await shot('audit-after-'+page+'.png');}
  await evaluate("go('sprints',{team_id:'1',iteration_id:'5',tab:'capacity'})");await until(()=>evaluate('!!document.querySelector(".ado-capacity")'),'capacity');await shot('audit-after-capacity.png');
  await evaluate("go('sprints',{team_id:'1',iteration_id:'5',tab:'analytics'})");await until(()=>evaluate('!!document.querySelector(".analytics-card")'),'analytics');await shot('audit-after-analytics.png');
  await evaluate('openItem(Number(state.items.find(i=>i.parent_id)?.id || state.items[0].id))');await shot('audit-after-detail.png');
  await evaluate('closeDialog(true)');
  await evaluate("go('queries',{})");await until(()=>evaluate('!!document.querySelector(".reference-query-tree")'),'queries');
  const advancedQueries=await evaluate('state.meta.queries.filter(q=>JSON.parse(q.filters).query_type).map(q=>({id:q.id,type:JSON.parse(q.filters).query_type}))');
  for(const q of advancedQueries){await evaluate(`go('queries',{editor:'${q.id}',qtab:'results'})`);await until(()=>evaluate(`state.filters.editor==='${q.id}' && !!document.querySelector('.advanced-query-results')`),'advanced query results');await shot('audit-advanced-query-'+q.type+'.png');}
  await evaluate("go('delivery',{})");await until(()=>evaluate('!!document.querySelector(".delivery-plan-list")'),'delivery plans');
  const deliveryPlan=await evaluate('document.querySelector("[data-action=delivery-open]")?.dataset.id');
  if(deliveryPlan){await click('[data-action=delivery-open]');await until(()=>evaluate('!!document.querySelector(".delivery-timeline")'),'delivery timeline');await shot('audit-delivery-plan.png');}
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const page of ['workitems','board','backlog','queries','sprints']) {
    await navigate(page);await shot('audit-mobile-'+page+'.png');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),page+' page overflow');
  }
  if(deliveryPlan){await evaluate(`go('delivery',{plan:'${deliveryPlan}'})`);await until(()=>evaluate('!!document.querySelector(".delivery-timeline")'),'mobile delivery');assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),'delivery mobile overflow');await shot('audit-mobile-delivery.png');}
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'ui-review-results.json'),JSON.stringify({passed:true,pages:['workitems','board','backlog','queries','sprints','capacity','analytics','detail','delivery'],advancedQueries:advancedQueries.length,deliveryPlan,desktop:{width:1600,height:1000},mobile:{width:390,height:844},errors},null,2));
}finally{socket?.close();browser.kill();}
