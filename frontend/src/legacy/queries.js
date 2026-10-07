'use strict';
window.MiniQueries = (() => {
  const fields = { title: 'Title', id: 'ID', type: 'Work Item Type', state: 'State', assignee_id: 'Assigned To', created_by: 'Created By', priority: 'Priority', tags: 'Tags', area: 'Area Path', iteration_id: 'Iteration ID', parent_id: 'Parent ID', estimate: 'Effort', remaining_work: 'Remaining Work', original_estimate: 'Original Estimate', completed_work: 'Completed Work', created: 'Created Date', changed: 'Changed Date', target_date: 'Target Date', blocked: 'Blocked', severity: 'Severity', activity: 'Activity' };
  const operators = { '=': '=', '!=': '<>', contains: 'Contains', notContains: 'Does Not Contain', in: 'In', notIn: 'Not In', '>': '>', '>=': '>=', '<': '<', '<=': '<=', empty: 'Is Empty', notEmpty: 'Is Not Empty', under: 'Under' };
  let draft, folders = [], results, draftKey = '';
  fields.project_id = 'Team Project ID';
  const collapsed = new Set();
  function makeDraft(query, filters) {
    let target = { group: 'AND', rules: [] };
    if (filters.target_clauses) target = typeof filters.target_clauses === 'string' ? JSON.parse(filters.target_clauses) : filters.target_clauses;
    return { query, root: fromFilters(filters), target, query_type: filters.query_type || 'flat', across_projects: filters.across_projects === true || filters.across_projects === 'true', project_ids: filters.project_ids || [], link_kind: filters.link_kind || 'related', link_direction: filters.link_direction || 'both', link_mode: filters.link_mode || 'must' };
  }
  function filtersForDraft() {
    const {query_type, across_projects, project_ids, link_kind, link_direction, link_mode} = draft;
    return { view: 'all', include_completed: 'true', limit: '500', clauses: draft.root, target_clauses: draft.target, query_type, across_projects, project_ids, link_kind, link_direction, link_mode };
  }
  const base = () => `/projects/${state.project}`;
  function fromFilters(filters) {
    if (filters.clauses) { try { return typeof filters.clauses === 'string' ? JSON.parse(filters.clauses) : filters.clauses; } catch { /* Continue with simple filters. */ } }
    const rules = [];
    for (const key of ['type', 'state', 'area', 'assignee_id', 'iteration_id']) if (filters[key]) rules.push({ field: key, op: '=', value: String(filters[key]) });
    if (filters.q) rules.push({ field: 'title', op: 'contains', value: filters.q });
    if (filters.tag) rules.push({ field: 'tags', op: 'contains', value: filters.tag });
    if (filters.view === 'mine') rules.push({ field: 'assignee_id', op: '=', value: '@Me' });
    return { group: 'AND', rules: rules.length ? rules : [{ field: 'state', op: '!=', value: 'Removed' }] };
  }
  async function render(sequence) {
    folders = await api(base() + '/query-folders'); if (sequence !== state.sequence) return;
    const editor = state.filters.editor;
    if (editor) {
      const key = state.project + ':' + editor;
      if (!draft || draftKey !== key) {
        draftKey = key; results = null; const query = editor === 'new' ? null : state.meta.queries.find(q => q.id === Number(editor));
        if (editor !== 'new' && !query) throw Error('查询不存在或无权访问');
        draft = makeDraft(query, query ? JSON.parse(query.filters) : {});
      }
      if (state.filters.qtab === 'results' && !results) await run(false);
      editorPage(); return;
    }
    listPage();
  }
  function listPage() { ReferenceUI.queries(folders); }
  function groupHtml(node, path = 'root', depth = 0) {
    if (node.rules) return `<div class="clause-group" data-clause-group="${path}"><div class="clause-group-heading">${select('group-' + path, option('AND', 'And · 全部满足', node.group) + option('OR', 'Or · 任一满足', node.group))}${button('add-clause', '＋ Add new clause', `data-path="${path}"`, 'quiet')}${depth < 4 ? button('add-clause-group', '＋ 条件组', `data-path="${path}"`, 'quiet') : ''}${path.includes('.') ? button('remove-clause', '×', `data-path="${path}"`, 'quiet danger') : ''}</div>${node.rules.map((rule, i) => groupHtml(rule, path + '.' + i, depth + 1)).join('')}</div>`;
    return `<div class="query-clause" data-clause="${path}">${select('field-' + path, Object.entries(fields).map(([v, name]) => option(v, name, node.field)).join(''), 'aria-label="查询字段"')}${select('op-' + path, Object.entries(operators).map(([v, name]) => option(v, name, node.op)).join(''), 'aria-label="查询操作符"')}${input('value-' + path, node.value, 'maxlength="1000" aria-label="查询值" placeholder="值 / @Me / @Today-7"')}${button('remove-clause', '×', `data-path="${path}" aria-label="移除条件"`, 'quiet danger')}</div>`;
  }
  function readDraft() {
    const form = $('#query-editor-form'); if (!form) return;
    const read = (node, path) => { if (node.rules) { node.group = form.elements['group-' + path].value; node.rules.forEach((n, i) => read(n, path + '.' + i)); } else { node.field = form.elements['field-' + path].value; node.op = form.elements['op-' + path].value; node.value = form.elements['value-' + path].value; } }; read(draft.root, 'root');
    if (form.elements['group-target']) read(draft.target, 'target');
    for (const name of ['query_type', 'link_kind', 'link_direction', 'link_mode']) if (form.elements[name]) draft[name] = form.elements[name].value;
    draft.across_projects = form.elements.across_projects.checked;
    if (form.elements.project_ids) draft.project_ids = [...form.elements.project_ids.selectedOptions].map(o => Number(o.value));
  }
  function nodeAt(path) { return path.split('.').slice(1).reduce((node, index) => node.rules[Number(index)], path.startsWith('target') ? draft.target : draft.root); }
  function queryForm() {
    const labels = '<div class="query-grid-labels"><span>Field</span><span>Operator</span><span>Value</span><span></span></div>';
    return `<form id="query-editor-form"><div class="advanced-query-options"><label>Query type ${select('query_type', [['flat','Flat list of work items'],['tree','Tree of work items'],['links','Work items and direct links']].map(([v,n])=>option(v,n,draft.query_type)).join(''))}</label><label class="query-across"><input type="checkbox" name="across_projects" ${draft.across_projects?'checked':''}> Query across projects</label>${draft.across_projects ? `<label>Projects ${select('project_ids',state.projects.map(p=>`<option value="${p.id}" ${draft.project_ids.includes(p.id)?'selected':''}>${esc(p.name)}</option>`).join(''),'multiple size="3" aria-label="查询项目范围"')}<small>不选项目表示查询所有有权访问的项目；可按 Ctrl 多选。</small></label>` : `<span>${esc(state.meta.project.name)}</span>`}</div>${draft.query_type !== 'flat'?'<h3>Filters for top level work items</h3>':''}${labels}${groupHtml(draft.root)}${draft.query_type !== 'flat' ? `<h3>Filters for ${draft.query_type==='tree'?'child':'linked'} work items</h3>${labels}${groupHtml(draft.target,'target')}`:''}${draft.query_type === 'links' ? `<div class="advanced-query-options"><label>Type of links ${select('link_kind',[['related','Related'],['parent','Parent / Child'],['dependency','Predecessor / Successor'],['duplicate','Duplicate'],['all','All work item links']].map(([v,n])=>option(v,n,draft.link_kind)).join(''))}</label><label>Direction ${select('link_direction',[['both','Both directions'],['forward','Forward (source → target)'],['reverse','Reverse (target → source)']].map(([v,n])=>option(v,n,draft.link_direction)).join(''))}</label><label>Filter options ${select('link_mode',[['must','Only items with matching links'],['may','Include items without matching links'],['not','Only items without matching links']].map(([v,n])=>option(v,n,draft.link_mode)).join(''))}</label></div>`:''}</form><p class="hint">支持 And/Or 分组、@Me、@Today±天数、In（分号分隔）及 Area Path Under。跨项目结果按当前账号权限过滤。树形结果保留通往匹配子项的祖先行。</p>`;
  }
  function resultTable() {
    const rows = results.rows || results.items.map(i=>({id:i.id,depth:0})); const items = new Map(results.items.map(i=>[i.id,i]));
    let hideDepth = null;
    return `<div class="advanced-query-results"><table><thead><tr><th>Title</th><th>ID</th><th>Team Project</th><th>Work Item Type</th><th>State</th><th>Assigned To</th><th>Link</th></tr></thead><tbody>${rows.map((row,index)=>{
      if(hideDepth !== null && row.depth>hideDepth) return ''; hideDepth=null;
      const item=items.get(row.id), nested=rows[index+1]?.depth>row.depth;
      if(collapsed.has(index)) hideDepth=row.depth;
      return `<tr ${row.context?'class="query-context"':''}><td><div class="query-tree-title" data-depth="${row.depth}">${nested?button('query-fold',collapsed.has(index)?'›':'⌄',`data-index="${index}" aria-label="展开或折叠子项" aria-expanded="${!collapsed.has(index)}"`,'quiet'): '<span class="query-fold-spacer"></span>'}${button('scoped-item',esc(item.title),`data-id="${item.id}" data-project="${item.project_id}"`,'quiet link')}${row.context?'<small>祖先</small>':''}</div></td><td>${item.id}</td><td>${esc(item.project_name)}</td><td>${esc(item.type)}</td><td>${esc(item.state)}</td><td>${esc(item.assignee_name||'Unassigned')}</td><td>${esc(row.relation||'')}</td></tr>`;
    }).join('')}</tbody></table>${rows.length?'':'<p class="empty">没有符合条件的工作项。</p>'}</div>`;
  }
  function editorPage() {
    const tab = state.filters.qtab || 'editor'; const canSave = !draft.query || draft.query.user_id === state.user.id || state.user.admin && draft.query.shared;
    $('#page-content').innerHTML = `<div class="query-editor-heading"><div>${button('all-queries', '‹ Queries', '', 'quiet')}<h2>${esc(draft.query?.name || 'New query')}</h2><span>${draft.query?.shared ? 'Shared Queries' : 'My Queries'}</span></div><div class="commands">${button('run-query', '▶ Run query', '', 'primary')}${canSave ? button('save-editor-query', 'Save') : ''}${button('save-query-copy', 'Save as', '', 'quiet')}</div></div><div class="ado-tabs">${['results', 'editor', 'charts'].map(t => button('query-editor-tab', { results: 'Results', editor: 'Editor', charts: 'Charts' }[t], `data-tab="${t}"`, tab === t ? 'selected' : 'quiet')).join('')}</div>${tab === 'editor' ? queryForm() : tab === 'charts' ? queryChart() : results ? `<div class="query-result-summary">${results.total} 个结果 · 显示前 ${results.items.length} 项${button('export', '↓ 导出当前页', '', 'quiet')}</div>${resultTable()}` : '<div class="empty"><h2>Run to see query results.</h2></div>'}`;
    if (tab === 'results' && results) document.querySelectorAll('.query-tree-title').forEach(el => el.style.paddingLeft = (Number(el.dataset.depth) * 22) + 'px');
  }
  async function run(update = true) {
    readDraft(); const filters = filtersForDraft(); collapsed.clear();
    results = await api(base() + '/query-run', { method: 'POST', body: { filters: JSON.stringify(filters) } }); state.items = results.items; state.total = results.total;
    if (update) { state.filters.qtab = 'results'; history.replaceState(null, '', `#/queries?${new URLSearchParams({ project: state.project, ...state.filters })}`); editorPage(); }
  }
  function queryChart() {
    if (!results) return '<div class="empty"><h2>先运行查询，再查看结果分布。</h2></div>';
    const counts = new Map(); for (const i of results.items) counts.set(i.state, (counts.get(i.state) || 0) + 1); const max = Math.max(1, ...counts.values());
    return `<section class="analytics-card"><h2>Work items by State</h2><p class="hint">统计当前查询已加载的 ${results.items.length} 项${results.total > results.items.length ? '，不是全部结果' : ''}。</p><svg class="distribution-chart" viewBox="0 0 900 ${counts.size * 42 + 20}" role="img" aria-label="查询结果按状态分布">${[...counts].map(([name, count], i) => `<text x="120" y="${i * 42 + 25}" text-anchor="end">${esc(name)}</text><rect x="135" y="${i * 42 + 6}" width="${count / max * 680}" height="26"/><text x="${145 + count / max * 680}" y="${i * 42 + 25}">${count}</text>`).join('')}</svg></section>`;
  }
  function saveDialog(copy = false) {
    readDraft(); const query = copy ? null : draft.query;
    modal(copy ? 'Save query as' : 'Save query', field('名称', input('name', query?.name || '', 'required maxlength="100"')) + field('位置', select('shared', option('0', 'My Queries', query?.shared || 0) + (writable() ? option('1', 'Shared Queries', query?.shared) : ''))) + field('文件夹', select('folder', option('', '根目录', query?.folder) + folders.filter(f => f.shared === (query?.shared || 0)).map(f => option(f.name, f.name, query?.folder)).join(''))), async form => {
      const data = Object.fromEntries(new FormData(form)); data.shared = Number(data.shared); data.filters = JSON.stringify(filtersForDraft()); if (query) data.version = query.version;
      const saved = await api(base() + '/queries' + (query ? '/' + query.id : ''), { method: query ? 'PATCH' : 'POST', body: data }); closeDialog(true); draftKey = ''; draft = null; toast('查询已保存'); go('queries', { editor: String(saved.id), qtab: 'editor' });
    });
  }
  const oldHandle = handle;
  handle = async (action, element) => {
    const id = Number(element.dataset.id);
    if (action === 'open-query-editor') { draft = makeDraft(null, state.filters); draftKey = state.project + ':new'; results = null; return go('queries', { editor: 'new' }); }
    if (action === 'open-selected-query') { draft=makeDraft(null,{clauses:{group:'AND',rules:[{field:'id',op:'in',value:element.dataset.ids}]}});draftKey=state.project+':new';results=null;return go('queries',{editor:'new',qtab:'results'}); }
    if (action === 'new-query') { draft = null; draftKey = ''; return go('queries', { editor: 'new' }); }
    if (action === 'edit-query' || action === 'run-saved-query') { draft = null; draftKey = ''; return go('queries', { editor: String(id), qtab: action === 'run-saved-query' ? 'results' : 'editor' }); }
    if (action === 'query-fold') { const index = Number(element.dataset.index); collapsed.has(index) ? collapsed.delete(index) : collapsed.add(index); editorPage(); return; }
    if (action === 'all-queries') return go('queries', {});
    if (action === 'query-favorites') return go('queries', { favorites: element.dataset.value });
    if (action === 'favorite-query') { const q = state.meta.queries.find(q => q.id === id); await api(base() + `/queries/${id}/favorite`, { method: 'POST', body: { favorite: q.favorite ? 0 : 1 } }); return globalThis.render(); }
    if (action === 'query-editor-tab') { readDraft(); state.filters.qtab = element.dataset.tab; editorPage(); return; }
    if (action === 'run-query') return run();
    if (action === 'save-editor-query' || action === 'save-query-copy') return saveDialog(action === 'save-query-copy');
    if (action === 'add-clause' || action === 'add-clause-group' || action === 'remove-clause') {
      readDraft(); const path = element.dataset.path;
      if (action === 'remove-clause') { const parts = path.split('.'); const i = Number(parts.pop()); nodeAt(parts.join('.')).rules.splice(i, 1); }
      else nodeAt(path).rules.push(action === 'add-clause-group' ? { group: 'OR', rules: [{ field: 'state', op: '=', value: 'New' }] } : { field: 'title', op: 'contains', value: '' }); editorPage(); return;
    }
    if (action === 'new-query-folder') return modal('New folder', field('文件夹路径', input('name', '', 'required maxlength="200" placeholder="例如：Planning/Release"')) + field('位置', select('shared', option(0, 'My Queries', 0) + (writable() ? option(1, 'Shared Queries', 0) : ''))), async form => { const data = Object.fromEntries(new FormData(form)); data.shared = Number(data.shared); await api(base() + '/query-folders', { method: 'POST', body: data }); closeDialog(true); await globalThis.render(); }, '创建');
    return oldHandle(action, element);
  };
  document.addEventListener('change', event => { if (event.target.closest('#query-editor-form') && ['query_type', 'across_projects'].includes(event.target.name)) { readDraft(); editorPage(); }  if (dialog.open && event.target.name === 'shared' && $('[name="folder"]', dialog)) $('[name="folder"]', dialog).innerHTML = option('', '根目录', '') + folders.filter(f => f.shared === Number(event.target.value)).map(f => option(f.name, f.name, '')).join(''); });
  return { render };
})();
