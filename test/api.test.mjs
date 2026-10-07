import test from 'node:test';
import assert from 'node:assert/strict';
import { start, client } from './helpers.mjs';

test('Boards: authorization, project boundaries, workflow, concurrency and persistence', async t => {
  let server = await start({ env: process.env.DEVOPS_TEST_MYSQL ? { DEVOPS_DB_PROVIDER: 'mysql', DEVOPS_MYSQL_CONNECTION_STRING: process.env.DEVOPS_TEST_MYSQL } : {} });
  t.after(async () => server.stop());
  const admin = client(server.base), editor = client(server.base), reader = client(server.base), outsider = client(server.base);
  const password = 'Test-only-password-2026';
  await t.test('first-run setup and authenticated sessions', async () => {
    assert.equal((await admin.request('/setup')).required, true);
    await outsider.request('/projects', 'GET', undefined, { status: 401 });
    const me = await admin.request('/setup', 'POST', { name: 'Test Admin', login: 'admin', password, demo: true });
    assert.equal(me.user.admin, true);
    await admin.request('/setup', 'POST', { name: 'Duplicate', login: 'duplicate', password }, { status: 409 });
    await admin.request('/projects', 'POST', { name: 'Rejected' }, { noCsrf: true, status: 403 });
    await admin.request('/projects', 'POST', { name: 'Rejected' }, { headers: { Origin: 'https://untrusted.example' }, status: 403 });
  });
  const project = (await admin.request('/projects'))[0].id;
  const projectPath = `/projects/${project}`;
  await t.test('seed hierarchy and reciprocal parent/child links', async () => {
    const rows = (await admin.request(projectPath + '/items?view=all&include_completed=true')).items;
    for (const row of rows.filter(i => ['Task', 'Bug'].includes(i.type))) {
      const detail = await admin.request(`/items/${row.id}`);
      assert.equal(detail.parent.type, 'Product Backlog Item');
      const parent = await admin.request(`/items/${detail.parent.id}`);
      assert.ok(parent.children.some(i => i.id === row.id));
    }
    const parents = rows.filter(i => i.type === 'Product Backlog Item');
    let leaf = await admin.request(projectPath + '/items', 'POST', {title:'Reparent verification', type:'Task', parent_id:parents[0].id});
    leaf = await admin.request(`/items/${leaf.id}`, 'PATCH', {parent_id:parents[1].id, version:leaf.version});
    assert.equal((await admin.request(`/items/${leaf.id}`)).parent.id, parents[1].id);
    assert.equal((await admin.request(`/items/${parents[0].id}`)).children.some(i=>i.id===leaf.id), false);
    assert.ok((await admin.request(`/items/${parents[1].id}`)).children.some(i=>i.id===leaf.id));
    leaf = await admin.request(`/items/${leaf.id}`, 'PATCH', {parent_id:null, version:leaf.version});
    assert.equal((await admin.request(`/items/${leaf.id}`)).parent, null);
    assert.equal((await admin.request(`/items/${parents[1].id}`)).children.some(i=>i.id===leaf.id), false);
    // Keep the existing recycle-bin assertions scoped to their own fixtures.
    await admin.request(`/items/${leaf.id}`, 'PATCH', {state:'Done', version:leaf.version});
  });
  let editorId, readerId, privateProject, privateItem, item, child;
  await t.test('accounts, memberships and project isolation', async () => {
    editorId = (await admin.request('/users', 'POST', { name: 'Editor', login: 'editor', password })).id;
    readerId = (await admin.request('/users', 'POST', { name: 'Reader', login: 'reader', password })).id;
    await admin.request(projectPath + '/members', 'POST', { user_id: editorId, role: 'editor' });
    await admin.request(projectPath + '/members', 'POST', { user_id: readerId, role: 'reader' });
    await editor.request('/login', 'POST', { login: 'editor', password });
    await reader.request('/login', 'POST', { login: 'reader', password });
    privateProject = (await admin.request('/projects', 'POST', { name: 'Private', description: 'Isolation' })).id;
    privateItem = await admin.request(`/projects/${privateProject}/items`, 'POST', { title: 'Private work', type: 'Task' });
    assert.equal((await editor.request('/projects')).length, 1);
    await editor.request(`/projects/${privateProject}`, 'GET', undefined, { status: 404 });
    await editor.request(`/items/${privateItem.id}`, 'GET', undefined, { status: 404 });
    await reader.request(projectPath + '/items', 'POST', { title: 'Forbidden', type: 'Task' }, { status: 403 });
    await editor.request('/users', 'GET', undefined, { status: 403 });
  });
  await t.test('create, validate fields and filter by current user, ID and tags', async () => {
    item = await editor.request(projectPath + '/items', 'POST', { title: '<script>escaped</script> Searchable task', type: 'Task', assignee_id: editorId, tags: 'Test; Backend', priority: 1, estimate: 3 });
    assert.equal(item.state, 'To Do');
    const mine = await editor.request(projectPath + '/items?view=mine'); assert.equal(mine.total, 1);
    assert.equal((await editor.request(projectPath + `/items?q=${item.id}`)).items[0].id, item.id);
    assert.equal((await editor.request(projectPath + '/items?q=Searchable&tag=Backend')).total, 1);
    await editor.request(projectPath + '/items', 'POST', { title: 'Bad', type: 'Task', priority: 0 }, { status: 400 });
    await editor.request(projectPath + '/items', 'POST', { title: 'Bad', type: 'Task', assignee_id: 99999 }, { status: 400 });
    await editor.request(projectPath + '/items', 'POST', { title: 'Bad', type: 'Task', parent_id: privateItem.id }, { status: 400 });
    await editor.request(projectPath + '/items', 'POST', { title: 'Bad', type: 'Task', state: 'Resolved' }, { status: 400 });
  });
  await t.test('workflow updates, stale writes and persisted comments', async () => {
    const before = item.version;
    item = await editor.request(`/items/${item.id}`, 'PATCH', { state: 'In Progress', version: before });
    assert.equal(item.state, 'In Progress');
    await editor.request(`/items/${item.id}`, 'PATCH', { title: 'Lost update', version: before }, { status: 409 });
    await reader.request(`/items/${item.id}`, 'PATCH', { state: 'Done', version: item.version }, { status: 403 });
    await editor.request(`/items/${item.id}/comments`, 'POST', { body: 'Stale comment', version: before }, { status: 409 });
    await editor.request(`/items/${item.id}/comments`, 'POST', { body: 'Implementation ready', version: item.version });
    const detail = await editor.request(`/items/${item.id}`); assert.equal(detail.comments[0].body, 'Implementation ready'); assert.equal(detail.history.length, 2); item = detail.item;
  });
  await t.test('parent hierarchy, cycle protection and recycle bin', async () => {
    child = await editor.request(projectPath + '/items', 'POST', { title: 'Child task', type: 'Task', parent_id: item.id });
    await editor.request(`/items/${item.id}`, 'PATCH', { parent_id: item.id, version: item.version }, { status: 400 });
    await editor.request(`/items/${item.id}`, 'PATCH', { parent_id: child.id, version: item.version }, { status: 400 });
    await editor.request(`/items/${item.id}`, 'DELETE', { version: item.version }, { status: 409 });
    await editor.request(`/items/${child.id}`, 'DELETE', { version: child.version });
    await editor.request(`/items/${item.id}`, 'DELETE', { version: item.version });
    assert.equal((await editor.request(projectPath + '/items?view=recycle')).total, 2);
    const removed = (await editor.request(`/items/${child.id}`)).item;
    await editor.request(`/items/${child.id}/restore`, 'POST', { version: removed.version }, { status: 409 });
    item = (await editor.request(`/items/${item.id}`)).item;
    await editor.request(`/items/${item.id}/restore`, 'POST', { version: item.version });
    await editor.request(`/items/${child.id}/restore`, 'POST', { version: removed.version });
  });
  await t.test('iterations, personal queries, pagination and membership removal', async () => {
    await editor.request(projectPath + '/iterations', 'POST', { name: 'Invalid dates', start_date: '2026-10-08', end_date: '2026-10-01' }, { status: 400 });
    const sprint = await editor.request(projectPath + '/iterations', 'POST', { name: 'Sprint Test', start_date: '2026-10-01', end_date: '2026-10-14' });
    item = (await editor.request(`/items/${item.id}`)).item;
    item = await editor.request(`/items/${item.id}`, 'PATCH', { iteration_id: sprint.id, version: item.version });
    assert.equal((await editor.request(projectPath + `/items?iteration_id=${sprint.id}`)).total, 1);
    const query = await reader.request(projectPath + '/queries', 'POST', { name: 'My query', filters: '{"state":"In Progress"}' });
    assert.equal((await reader.request(projectPath)).queries.length, 1); assert.equal((await editor.request(projectPath)).queries.length, 0);
    await editor.request(projectPath + `/queries/${query.id}`, 'DELETE', {}, { status: 404 });
    assert.equal((await reader.request(projectPath)).queries.length, 1);
    const page = await editor.request(projectPath + '/items?limit=2&offset=1'); assert.equal(page.items.length, 2); assert.ok(page.total > 2);
    await admin.request(projectPath + `/members/${editorId}`, 'DELETE', {});
    await editor.request(`/items/${item.id}`, 'GET', undefined, { status: 404 });
    assert.equal((await admin.request(`/items/${item.id}`)).item.assignee_id, null);
  });
  await t.test('restart preserves work items and comments, account can log in again', async () => {
    const directory = server.directory; await server.stop();
    server = await start({ directory, env: process.env.DEVOPS_TEST_MYSQL ? { DEVOPS_DB_PROVIDER: 'mysql', DEVOPS_MYSQL_CONNECTION_STRING: process.env.DEVOPS_TEST_MYSQL } : {} });
    const returning = client(server.base); assert.equal((await returning.request('/setup')).required, false);
    await returning.request('/login', 'POST', { login: 'admin', password });
    const detail = await returning.request(`/items/${item.id}`); assert.match(detail.item.title, /Searchable/); assert.equal(detail.comments.length, 1);
  });
});
