'use strict';
const $ = (s, root = document) => root.querySelector(s);
const app = $('#app'), dialog = $('#dialog');
const state = { user: null, csrf: '', projects: [], project: null, meta: null, items: [], total: 0, filters: {}, page: 'workitems', detail: null, dirty: false, sequence: 0 };
const names = { workitems: '工作项', board: '看板', backlog: '待办列表', sprints: '迭代', queries: '查询', settings: '项目设置' };
const typeNames = { Epic: 'Epic', Feature: 'Feature', 'Product Backlog Item': 'Backlog Item', Task: 'Task', Bug: 'Bug' };
const glyphs = { workitems: '▤', board: '▥', backlog: '☷', sprints: '◷', queries: '⌕', settings: '⚙', Epic: '♛', Feature: '◆', 'Product Backlog Item': '▤', Task: '✓', Bug: '◈' };
const typeClass = type => ({ Epic: 'epic', Feature: 'feature', 'Product Backlog Item': 'pbi', Task: 'task', Bug: 'bug' }[type] || 'pbi');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
// Vienna workflow colors are type-specific: Bug/In Progress differs from Task.
const dot = (value, type) => `<span class="state-dot ${value === 'Done' ? 'done' : ['Resolved', 'Removed'].includes(value) ? 'resolved' : value === 'In Review' ? 'in-review' : value === 'In Progress' && type === 'Bug' ? 'bug-progress' : ['Active', 'Committed', 'In Progress'].includes(value) ? 'active' : ''}"></span>${esc(value)}`;
const typeIcon = type => window.AzureUI ? AzureUI.typeIcon(type) : `<span class="type-icon ${typeClass(type)}" title="${esc(type)}">${glyphs[type] || '▤'}</span>`;
const avatar = name => `<span class="avatar">${esc((name || '?').slice(0, 1).toUpperCase())}</span>`;
const button = (action, text, extra = '', css = '') => `<button type="button" class="button ${css}" data-action="${action}" ${extra}>${text}</button>`;
const field = (label, control, css = '') => `<label class="field ${css}"><span>${label}</span>${control}</label>`;
const input = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
const option = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
const select = (name, options, attrs = '') => `<select name="${name}" ${attrs}>${options}</select>`;
const writable = () => state.meta?.role !== 'reader';
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body !== undefined) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
  if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch('/api' + path, { ...options, headers }); const data = await response.json();
  if (!response.ok) { if (response.status === 401 && state.user) { state.user = null; closeDialog(true); await auth(); } throw Error(data.error || '请求失败'); }
  return data;
}
function pref(key, fallback) { try { return JSON.parse(localStorage.getItem(`devops:${state.user.id}:${key}`)) ?? fallback; } catch { return fallback; } }
function savePref(key, value) { try { localStorage.setItem(`devops:${state.user.id}:${key}`, JSON.stringify(value)); } catch { /* Preferences are optional. */ } }
function route() { return new URL(location.hash.slice(1) || '/workitems', location.origin); }
function go(page = state.page, filters = state.filters) { const query = new URLSearchParams({ project: state.project, ...filters }); const next = `#/${page}?${query}`; if (location.hash === next) render(); else location.hash = next; }
async function auth() {
  const setup = await api('/setup'); document.title = 'Mini DevOps · 登录';
  app.innerHTML = `<div class="auth-page"><div class="auth-story"><img src="/icon.svg" width="48" height="48" alt=""><div class="wordmark">Mini DevOps</div><h1>把想法，<br>一步步变成成果。</h1><p>规划工作，保持专注。<br>让团队在同一个看板上协作。</p><div class="auth-preview"><span>待办</span><span>进行中</span><span>已完成</span><i></i><i></i><i></i><i></i></div><small>BOARDS · BACKLOGS · SPRINTS</small></div><div class="auth-form-wrap"><form id="auth-form" data-setup="${setup.required}"><div class="overline">你的团队工作空间</div><h2>${setup.required ? '开始使用 Mini DevOps' : '欢迎回来'}</h2><p class="muted">${setup.required ? '创建管理员账号，开启第一个项目。' : '登录以继续处理你的工作。'}</p><div class="form-error" role="alert"></div>${setup.required ? field('姓名', input('name', '', 'required maxlength="100" autocomplete="name"')) : ''}${field('账号', input('login', '', 'required minlength="3" maxlength="100" autocomplete="username"'))}${field('密码', input('password', '', `type="password" required ${setup.required ? 'minlength="12"' : ''} maxlength="128" autocomplete="${setup.required ? 'new-password' : 'current-password'}"`))}${setup.required ? `<p class="hint">密码至少 12 个字符。</p>${field('远程设置令牌（本机可留空）', input('setupToken', '', 'autocomplete="off"'))}<label class="check"><input type="checkbox" name="demo" checked> 添加示例工作项</label>` : ''}<button class="button primary full" type="submit">${setup.required ? '创建工作空间' : '登录'} <span>→</span></button><p class="hint">${setup.required ? '数据保存在你自己的部署环境中。' : '需要账号？请联系工作空间管理员。'}</p></form></div></div>`;
}
function shell() {
  document.title = `${names[state.page]} · ${state.meta.project.name} · Mini DevOps`;
  const nav = Object.entries(names).map(([key, label]) => `<a href="#/${key}?project=${state.project}" class="nav-item ${state.page === key ? 'selected' : ''}" ${state.page === key ? 'aria-current="page"' : ''}><span class="nav-icon">${glyphs[key]}</span>${label}${key === 'workitems' ? '<small>WORK</small>' : ''}</a>`).join('');
  app.innerHTML = `<header class="topbar"><a class="brand" href="#/workitems?project=${state.project}"><img src="/icon.svg" width="28" height="28" alt="">Mini DevOps</a><div class="breadcrumbs">工作空间 <span>/</span> ${select('project', state.projects.map(p => option(p.id, p.name, state.project)).join(''), 'aria-label="当前项目"')} <span>/</span> <b>Boards</b></div><div class="top-user">${button('account', `${avatar(state.user.name)}<span>${esc(state.user.name)}</span>`, '', 'quiet')}${button('logout', '退出', '', 'quiet')}</div></header><aside class="sidebar"><div class="project-label">项目</div><div class="project-switch">${select('project', state.projects.map(p => option(p.id, p.name, state.project)).join(''), 'aria-label="切换项目"')}${state.user.admin ? button('new-project', '+', 'aria-label="新建项目"', 'quiet') : ''}</div><div class="boards-label"><span>▥</span> Boards</div><nav aria-label="项目导航">${nav}</nav><div class="sidebar-bottom"><span class="status-dot"></span>团队工作空间<small>Mini DevOps 1.0</small></div></aside><main><div class="page-heading"><div><div class="overline">${esc(state.meta.project.name)} / BOARDS</div><h1>${names[state.page]}</h1></div><div class="heading-actions">${writable() ? button('new-item', '＋ 新建工作项', '', 'primary') : '<span class="readonly">只读访问</span>'}</div></div><div id="page-content"><div class="loading">正在加载工作项…</div></div></main>`;
}
async function render() {
  if (!state.user) return;
  const sequence = ++state.sequence; state.currentHash = location.hash; const url = route(); const page = url.pathname.slice(1); state.page = names[page] ? page : 'workitems';
  const project = Number(url.searchParams.get('project')) || Number(pref('project', 0)) || state.projects[0]?.id;
  if (!project || !state.projects.some(p => p.id === project)) {
    app.innerHTML = `<div class="empty-page"><img src="/icon.svg" width="48" alt=""><h1>还没有可访问的项目</h1><p>请管理员将你添加到项目中。</p>${state.user.admin ? button('new-project', '创建项目', '', 'primary') : ''}${button('logout', '退出登录')}</div>`; return;
  }
  state.project = project; savePref('project', project); state.filters = Object.fromEntries([...url.searchParams].filter(([key]) => key !== 'project'));
  try {
    const meta = await api(`/projects/${project}`); if (sequence !== state.sequence) return; state.meta = meta; shell();
    if (window.MiniBoards && await MiniBoards.renderPage(sequence)) return;
    if (state.page === 'settings') { await settings(); window.MiniBoards?.enhanceSettings(); return; }
    if (state.page === 'queries') { queries(); return; }
    const filters = { ...state.filters };
    if (state.page === 'workitems' && !filters.view) filters.view = 'mine';
    if (state.page === 'sprints' && !filters.iteration_id && meta.iterations.length) filters.iteration_id = String(meta.iterations[0].id);
    if (['board', 'sprints', 'backlog'].includes(state.page)) filters.limit = '500';
    state.filters = filters;
    const result = await api(`/projects/${project}/items?${new URLSearchParams(filters)}`); if (sequence !== state.sequence) return;
    state.items = result.items; state.total = result.total; state.pageSize = result.limit;
    $('#page-content').innerHTML = toolbar() + (['board', 'sprints'].includes(state.page) ? board() : table()) + footer(result);
    window.MiniWorkItems?.enhanceList();
    if (url.searchParams.has('item')) await openItem(Number(url.searchParams.get('item')));
  } catch (error) { toast(error.message); if ($('#page-content')) $('#page-content').innerHTML = `<div class="empty"><h2>暂时无法加载</h2><p>${esc(error.message)}</p>${button('refresh', '重试')}</div>`; }
}
function toolbar() {
  const f = state.filters; const views = [['all', '全部工作项'], ['mine', '分配给我'], ['created', '由我创建'], ['following', '我关注的'], ['recent', '最近查看'], ['recycle', '回收站']];
  const sprint = state.meta.iterations.find(i => String(i.id) === f.iteration_id);
  return `${state.page === 'sprints' ? `<div class="sprint-summary"><div><h2>${esc(sprint?.name || '尚未创建迭代')}</h2><p>${sprint ? `${esc(sprint.start_date)} — ${esc(sprint.end_date)} · ${state.items.filter(i => i.state === 'Done').length} / ${state.total} 项已完成` : '创建一个有明确起止日期的迭代，安排本轮工作。'}</p></div>${writable() ? button('new-iteration', '＋ 新建迭代') : ''}</div>` : ''}<div class="commandbar"><div class="view-picker">${select('view', views.map(([v, label]) => option(v, label, f.view || 'all')).join(''), 'data-filter aria-label="工作项视图"')}<span class="divider"></span><span class="result-count">${state.total} 个工作项</span></div><div class="commands">${button('refresh', '↻ 刷新', '', 'quiet')}${button('save-query', '☆ 保存查询', '', 'quiet')}${!['board', 'sprints'].includes(state.page) ? button('columns', '▥ 列选项', '', 'quiet') : ''}${button('export', '↓ 导出当前页', '', 'quiet')}</div></div><form id="filters" class="filterbar"><span class="search-icon">⌕</span><input name="q" aria-label="关键词" placeholder="按标题或编号搜索，回车确认" value="${esc(f.q)}"><div class="filter-selects">${select('type', option('', '所有类型', f.type) + Object.keys(state.meta.types).map(t => option(t, typeNames[t], f.type)).join(''), 'data-filter aria-label="类型"')}${select('state', option('', '所有状态', f.state) + [...new Set(Object.values(state.meta.types).flat())].map(s => option(s, s, f.state)).join(''), 'data-filter aria-label="状态"')}${select('assignee_id', option('', '所有成员', f.assignee_id) + option('0', '未分配', f.assignee_id) + state.meta.members.map(m => option(m.id, m.name, f.assignee_id)).join(''), 'data-filter aria-label="负责人"')}${select('iteration_id', option('', '所有迭代', f.iteration_id) + option('0', '未安排迭代', f.iteration_id) + state.meta.iterations.map(i => option(i.id, i.name, f.iteration_id)).join(''), 'data-filter aria-label="迭代"')}<input name="area" class="small-filter" aria-label="Area Path" placeholder="Area Path" value="${esc(f.area)}"><input name="tag" class="small-filter" aria-label="标签" placeholder="标签" value="${esc(f.tag)}">${button('clear-filters', '×', 'aria-label="清除筛选"', 'quiet')}</div><button class="sr-only" type="submit">搜索</button></form>${state.total > state.items.length && ['board', 'sprints', 'backlog'].includes(state.page) ? '<p class="notice">此视图最多展示 500 项。请使用筛选缩小范围；工作项列表支持翻页。</p>' : ''}`;
}
const allColumns = { type: '类型', assignee: '负责人', priority: '优先级', area: 'Area Path', tags: '标签', comments: '评论', changed: '更新时间' };
function columns() { const c = pref('columns', Object.keys(allColumns)); return Array.isArray(c) ? Object.keys(allColumns).filter(k => c.includes(k)) : Object.keys(allColumns); }
function table() {
  if (!state.items.length) return empty();
  const cols = columns(); let items = state.items; const levels = new Map();
  if (state.page === 'backlog') {
    const ids = new Set(items.map(i => i.id)); const result = []; const visit = (parent, level) => { for (const item of items.filter(i => i.parent_id === parent)) { result.push(item); levels.set(item.id, level); visit(item.id, level + 1); } };
    for (const root of items.filter(i => !ids.has(i.parent_id))) { result.push(root); levels.set(root.id, 0); visit(root.id, 1); } items = result;
  }
  const sortable = (key, name) => `<button class="sort" data-sort="${key}">${name} ${state.filters.sort === key ? state.filters.dir === 'asc' ? '↑' : '↓' : ''}</button>`;
  return `<div class="table-wrap"><table class="work-table"><thead><tr><th>${sortable('id', 'ID')}</th><th class="title-cell">${sortable('title', '标题')}</th><th>${sortable('state', '状态')}</th>${cols.map(c => `<th>${['type', 'priority', 'changed'].includes(c) ? sortable(c, allColumns[c]) : allColumns[c]}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr data-row="${item.id}" class="${state.detail?.id === item.id ? 'selected-row' : ''}"><td class="id-cell">${item.id}</td><td class="title-cell"><button class="item-title depth-${Math.min(levels.get(item.id) || 0, 4)}" data-open="${item.id}">${state.page === 'backlog' && item.parent_id ? '<span class="tree-mark">└</span>' : ''}${typeIcon(item.type)}<span>${esc(item.title)}</span></button></td><td class="state-cell">${dot(item.state, item.type)}</td>${cols.map(c => `<td>${cell(item, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function cell(item, column) {
  if (column === 'type') return `<span class="muted">${esc(typeNames[item.type])}</span>`;
  if (column === 'assignee') return item.assignee_name ? `<span class="person">${avatar(item.assignee_name)}${esc(item.assignee_name)}</span>` : '<span class="muted">未分配</span>';
  if (column === 'priority') return `<span class="priority p${item.priority}">P${item.priority}</span>`;
  if (column === 'area') return `<span class="area-text" title="${esc(item.area)}">${esc(item.area || '—')}</span>`;
  if (column === 'tags') return tags(item.tags);
  if (column === 'comments') return item.comment_count ? `<span class="comment-count">▱ ${item.comment_count}</span>` : '<span class="muted">—</span>';
  return `<span class="date">${date(item.changed)}</span>`;
}
function tags(value) { return `<span class="tags">${String(value || '').split(';').filter(t => t.trim()).map(t => `<span class="tag">${esc(t.trim())}</span>`).join('')}</span>`; }
function empty() { return `<div class="empty"><div class="empty-symbol">▥</div><h2>${state.filters.view === 'recycle' ? '回收站是空的' : '这里还没有工作项'}</h2><p>调整筛选条件，或为团队添加下一项工作。</p>${writable() && state.filters.view !== 'recycle' ? button('new-item', '＋ 新建工作项', '', 'primary') : button('clear-filters', '查看全部工作项')}</div>`; }
function board() {
  const stages = ['planned', 'working', 'review', 'done']; const labels = ['待办', '进行中', '待验收', '已完成'];
  const stage = item => item.state === 'Done' ? 'done' : item.state === 'Resolved' ? 'review' : ['Active', 'In Progress'].includes(item.state) ? 'working' : 'planned';
  return `<div class="board-hint">${writable() ? '拖动卡片切换状态，也可在详情中选择状态。' : '点击卡片查看详情。'}不同类型的工作项使用各自的状态流程。</div><div class="board">${stages.map((key, index) => { const items = state.items.filter(i => stage(i) === key); return `<section class="board-column ${key}" data-drop="${key}"><div class="column-heading"><h2>${labels[index]} <span>${items.length}</span></h2><small>${items.reduce((sum, i) => sum + i.estimate, 0)} 点</small></div><div class="card-stack">${items.map(item => `<article class="work-card ${typeClass(item.type)}" ${writable() && !item.deleted ? 'draggable="true"' : ''} data-drag="${item.id}"><div class="card-top">${typeIcon(item.type)}<span>${item.id}</span><span class="priority">P${item.priority}</span></div><button class="card-title" data-open="${item.id}">${esc(item.title)}</button>${tags(item.tags)}<div class="card-bottom"><span class="person">${avatar(item.assignee_name)}${esc(item.assignee_name || '未分配')}</span><span class="estimate">${item.estimate}</span></div><div class="card-state">${dot(item.state, item.type)}</div></article>`).join('')}${items.length ? '' : '<div class="drop-placeholder">暂无工作项</div>'}</div></section>`; }).join('')}</div>`;
}
function footer(result) { const paged = !['board', 'sprints', 'backlog'].includes(state.page); return `<div class="results-footer"><span>${result.total ? `显示 ${result.offset + 1}–${result.offset + state.items.length} 项，共 ${result.total} 项` : '0 个工作项'}</span><div>${paged ? `${button('previous-page', '← 上一页', result.offset === 0 ? 'disabled' : '')}${button('next-page', '下一页 →', result.offset + state.items.length >= result.total ? 'disabled' : '')}` : ''}</div><span class="muted">所有更改保存到服务器</span></div>`; }
function modal(title, content, onSubmit, submit = '保存', wide = false) {
  closeDialog(true); state.dirty = false; dialog.className = wide ? 'wide' : '';
  dialog.innerHTML = `<form id="modal-form"><div class="modal-heading"><h2>${title}</h2>${button('close-dialog', '×', 'aria-label="关闭"', 'quiet close-button')}</div><div class="modal-content"><div class="form-error" role="alert"></div>${content}</div><div class="modal-footer">${button('close-dialog', '取消')}<button class="button primary" type="submit">${submit}</button></div></form>`;
  dialog.onSubmit = onSubmit; dialog.showModal();
}
function closeDialog(force = false) {
  if (!force && state.dirty && !confirm('有尚未保存的修改，确定放弃吗？')) return false;
  if (dialog.open && route().searchParams.has('item')) {
    const url = route(); url.searchParams.delete('item');
    history.replaceState(null, '', '#' + url.pathname + url.search);
    state.currentHash = location.hash; delete state.filters.item;
  }
  dialog.close(); const main = $('main', app); if (main) main.inert = false;
  state.dirty = false; state.detail = null; return true;
}
async function openItem(id) {
  if (dialog.open && !closeDialog()) return;
  const result = id ? await api(`/items/${id}`) : null;
  const item = result?.item || { title: '', type: 'Task', state: 'To Do', assignee_id: state.meta.members.some(m => m.id === state.user.id) ? state.user.id : null, priority: 2, area: state.meta.project.name, tags: '', description: '', acceptance: '', estimate: 0, iteration_id: state.page === 'sprints' ? Number(state.filters.iteration_id) || null : null, parent_id: null };
  if (result && item.project_id !== state.project) return go('workitems', {project:item.project_id,view:'all',item:id});
  const readOnly = !writable() || !!item.deleted; const disabled = readOnly ? 'disabled' : '';
  modal(`${typeIcon(item.type)} <span>${id ? `${esc(item.type)} ${id}` : '新建工作项'}</span>`, `<div class="editor-title">${input('title', item.title, `required maxlength="300" placeholder="输入工作项标题" aria-label="标题" ${disabled}`)}</div><div class="editor-meta"><span>${id ? `${esc(item.creator_name)} 创建 · ${date(item.created)}` : '让下一步工作清晰可见'}</span>${id ? `<span>更新于 ${date(item.changed)} · 版本 ${item.version}</span>` : ''}</div>${item.deleted ? '<div class="notice">此工作项位于回收站。恢复后可继续编辑。</div>' : ''}<div class="editor-grid"><div class="editor-main"><div class="editor-tabs" role="tablist">${['详细信息', '讨论', '历史记录'].map((name, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-editor-tab="${i}" class="${i === 0 ? 'selected' : ''}">${name}${i === 1 ? ` <span>${result?.comments.length || 0}</span>` : ''}</button>`).join('')}</div><section data-editor-panel="0">${field('描述', `<textarea name="description" rows="8" maxlength="20000" placeholder="说明背景、目标和实现要求…" ${disabled}>${esc(item.description)}</textarea>`)}${field('验收标准', `<textarea name="acceptance" rows="4" maxlength="20000" placeholder="怎样判断这项工作已经完成？" ${disabled}>${esc(item.acceptance)}</textarea>`)}<div class="section-label">关联工作</div>${field('父工作项 ID', input('parent_id', item.parent_id || '', `type="number" min="1" placeholder="可选，同一项目内的工作项" ${disabled}`))}${result?.parent ? `<p class="link-row">父项 ${button('open-related', `#${result.parent.id} ${esc(result.parent.title)}`, `data-id="${result.parent.id}"`, 'quiet')}</p>` : ''}${result?.children.map(c => `<div class="link-row">${typeIcon(c.type)}${button('open-related', `#${c.id} ${esc(c.title)}`, `data-id="${c.id}"`, 'quiet')}<span>${dot(c.state, c.type)}</span></div>`).join('') || ''}</section><section data-editor-panel="1" hidden><div class="discussion">${result?.comments.map(c => `<article class="discussion-item">${avatar(c.user_name)}<div><b>${esc(c.user_name)}</b><time>${date(c.created)}</time><p>${esc(c.body)}</p></div></article>`).join('') || '<p class="muted">还没有评论。在这里记录进展，与团队保持同步。</p>'}</div>${id && !readOnly ? `${field('添加评论', '<textarea name="comment" rows="4" maxlength="10000" placeholder="分享进展或提出问题…"></textarea>')}${button('add-comment', '发送评论', '', 'primary')}` : '<p class="hint">保存工作项后可添加评论。</p>'}</section><section data-editor-panel="2" hidden>${result?.history.map(h => `<article class="history-item"><div>${avatar(h.user_name)}<b>${esc(h.user_name)}</b><time>${date(h.created)}</time></div><pre>${esc(h.body)}</pre></article>`).join('') || '<p class="muted">保存后开始记录修改历史。</p>'}</section></div><aside class="editor-fields">${field('类型', select('type', Object.keys(state.meta.types).map(t => option(t, t, item.type)).join(''), disabled))}${field('状态', select('state', [...new Set([...state.meta.types[item.type], item.state])].map(s => option(s, s, item.state)).join(''), disabled))}${field('负责人', select('assignee_id', option('', '未分配', item.assignee_id) + state.meta.members.map(m => option(m.id, m.name, item.assignee_id)).join(''), disabled))}${field('优先级', select('priority', [1, 2, 3, 4].map(p => option(p, `P${p} · ${['紧急', '高', '中', '低'][p - 1]}`, item.priority)).join(''), disabled))}${field('估算点数', input('estimate', item.estimate, `type="number" min="0" max="100000" ${disabled}`))}${field('Area Path', input('area', item.area, `maxlength="200" ${disabled}`))}${field('迭代', select('iteration_id', option('', '未安排迭代', item.iteration_id) + state.meta.iterations.map(i => option(i.id, i.name, item.iteration_id)).join(''), disabled))}${field('标签', input('tags', item.tags, `maxlength="1000" placeholder="使用分号分隔" ${disabled}`))}<p class="hint">例如：体验; 后端; 待评审</p></aside></div>`, async form => {
    const payload = Object.fromEntries(new FormData(form)); delete payload.comment;
    for (const key of ['assignee_id', 'iteration_id', 'parent_id']) payload[key] = payload[key] ? Number(payload[key]) : null;
    for (const key of ['priority', 'estimate', 'remaining_work', 'original_estimate', 'completed_work', 'blocked', 'severity']) if (payload[key] !== undefined) payload[key] = Number(payload[key]);
    if (id) payload.version = item.version;
    const saved = await api(id ? `/items/${id}` : `/projects/${state.project}/items`, { method: id ? 'PATCH' : 'POST', body: payload });
    const stayOpen = form.dataset.saveMode === 'stay';
    closeDialog(true); toast(`工作项 #${saved.id} 已保存`); await render();
    if (stayOpen) await openItem(saved.id);
  }, '保存并关闭', true);
  state.detail = item; state.editorSnapshot = JSON.stringify([...new FormData(document.querySelector('#modal-form'))].filter(([key]) => key !== 'comment'));
  if (readOnly) $('button[type="submit"]', dialog).hidden = true;
  if (id && writable()) $('.modal-footer', dialog).insertAdjacentHTML('afterbegin', item.deleted ? button('restore-item', '恢复工作项', '', 'primary left-action') : button('delete-item', '移入回收站', '', 'danger left-action'));
  return { item, result };
}
async function settings() {
  const users = state.user.admin ? await api('/users') : [];
  state.allUsers = users;
  $('#page-content').innerHTML = `<div class="settings-grid"><section class="settings-card"><div class="section-heading"><div><h2>项目成员</h2><p>编辑者可以管理工作项；只读成员可以查看。</p></div>${state.user.admin ? button('add-member', '＋ 添加成员') : ''}</div><div class="member-list">${state.meta.members.map(m => `<div class="member-row">${avatar(m.name)}<div><b>${esc(m.name)}</b><small>${esc(m.login)}</small></div><span class="role-badge">${m.role === 'reader' ? '只读' : '编辑者'}</span>${state.user.admin ? button('edit-member', '修改', `data-id="${m.id}"`, 'quiet') + button('remove-member', '移除', `data-id="${m.id}"`, 'quiet danger') : ''}</div>`).join('') || '<p class="muted">尚无成员</p>'}</div></section><section class="settings-card"><div class="section-heading"><div><h2>迭代计划</h2><p>用短周期组织和交付工作。</p></div>${writable() ? button('new-iteration', '＋ 新建迭代') : ''}</div>${state.meta.iterations.map(i => `<a class="iteration-row" href="#/sprints?project=${state.project}&iteration_id=${i.id}"><span>◷</span><div><b>${esc(i.name)}</b><small>${esc(i.start_date)} — ${esc(i.end_date)}</small></div><span>→</span></a>`).join('') || '<p class="muted">尚无迭代</p>'}</section>${state.user.admin ? `<section class="settings-card"><div class="section-heading"><div><h2>工作空间账号</h2><p>新账号需要加入项目后才能访问工作项。</p></div>${button('new-user', '＋ 创建账号')}</div>${users.map(u => `<div class="member-row">${avatar(u.name)}<div><b>${esc(u.name)}</b><small>${esc(u.login)}</small></div><span class="role-badge">${u.admin ? '管理员' : '成员'}</span></div>`).join('')}</section>` : ''}<section class="settings-card"><h2>关于此项目</h2><p>${esc(state.meta.project.description || '暂无项目描述')}</p><dl><dt>项目名称</dt><dd>${esc(state.meta.project.name)}</dd><dt>创建时间</dt><dd>${date(state.meta.project.created)}</dd><dt>工作项类型</dt><dd>Epic / Feature / Backlog Item / Task / Bug</dd></dl></section></div>`;
}
function queries() {
  $('#page-content').innerHTML = `<div class="query-intro"><h2>我的查询</h2><p>在工作项列表中设置筛选，然后选择“保存查询”。保存的查询会随账号同步。</p></div><div class="query-list"><a href="#/workitems?project=${state.project}&view=mine" class="query-card"><span>⌕</span><div><b>分配给我</b><p>查看当前项目中由你负责的工作项</p></div><span>→</span></a><a href="#/workitems?project=${state.project}&view=all" class="query-card"><span>▤</span><div><b>全部工作项</b><p>浏览当前项目的所有工作</p></div><span>→</span></a>${state.meta.queries.map(q => `<div class="query-card"><span>☆</span><div><button class="query-link" data-query="${q.id}">${esc(q.name)}</button><p>个人保存的查询</p></div>${button('delete-query', '删除', `data-id="${q.id}"`, 'quiet')}</div>`).join('')}</div>`;
}
async function boot() { try { const me = await api('/me'); Object.assign(state, me); state.projects = await api('/projects'); await render(); } catch (error) { if (!state.user) await auth(); else toast(error.message); } }
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; const submit = $('button[type="submit"]', form); if (submit?.disabled) return;
  try {
    if (submit) submit.disabled = true;
    const error = $('.form-error', form); if (error) error.textContent = '';
    if (form.id === 'auth-form') { const data = Object.fromEntries(new FormData(form)); data.demo = form.elements.demo?.checked || false; const result = await api(form.dataset.setup === 'true' ? '/setup' : '/login', { method: 'POST', body: data }); Object.assign(state, result); await boot(); }
    if (form.id === 'filters') { const filters = { ...state.filters, ...Object.fromEntries(new FormData(form)) }; delete filters.offset; for (const key in filters) if (!filters[key]) delete filters[key]; go(state.page, filters); }
    if (form.id === 'modal-form') await dialog.onSubmit(form);
  } catch (error) { const target = $('.form-error', form); if (target) { target.textContent = error.message; target.scrollIntoView({ block: 'nearest' }); } else toast(error.message); }
  finally { if (submit) submit.disabled = false; }
});
dialog.addEventListener('input', event => { if (event.target.type !== 'file') state.dirty = true; });
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('change', event => {
  const element = event.target;
  if (element.name === 'project' && !dialog.contains(element)) { state.project = Number(element.value); go('workitems', {}); }
  if (element.hasAttribute('data-filter')) { const filters = { ...state.filters }; delete filters.offset; if (element.value) filters[element.name] = element.value; else delete filters[element.name]; go(state.page, filters); }
  if (element.name === 'type' && dialog.contains(element)) { const states = state.meta.types[element.value]; const target = $('select[name="state"]', dialog); target.innerHTML = states.map(s => option(s, s, states.includes(target.value) ? target.value : states[0])).join(''); state.dirty = true; }
});
document.addEventListener('click', async event => {
  const open = event.target.closest('[data-open]'), action = event.target.closest('[data-action]'), sort = event.target.closest('[data-sort]'), tab = event.target.closest('[data-editor-tab]'), query = event.target.closest('[data-query]');
  try {
    if (open) await openItem(Number(open.dataset.open));
    if (sort) go(state.page, { ...state.filters, sort: sort.dataset.sort, dir: state.filters.sort === sort.dataset.sort && state.filters.dir === 'asc' ? 'desc' : 'asc', offset: '0' });
    if (tab) { for (const t of dialog.querySelectorAll('[data-editor-tab]')) { t.classList.toggle('selected', t === tab); t.setAttribute('aria-selected', String(t === tab)); } for (const panel of dialog.querySelectorAll('[data-editor-panel]')) panel.hidden = panel.dataset.editorPanel !== tab.dataset.editorTab; }
    if (query) { const q = state.meta.queries.find(q => q.id === Number(query.dataset.query)); go('workitems', JSON.parse(q.filters)); }
    if (action) { if (action.disabled) return; action.disabled = true; try { await handle(action.dataset.action, action); } finally { action.disabled = false; if (action.dataset.action.startsWith('capacity-')) window.CapacityUI?.syncControls(); window.DetailUI?.syncControls(); } }
  } catch (error) { const target = dialog.open && $('.form-error', dialog); if (target) target.textContent = error.message; else toast(error.message); }
});
async function handle(action, element) {
  const id = Number(element.dataset.id);
  if (action === 'close-dialog') closeDialog();
  if (action === 'refresh') await render();
  if (action === 'clear-filters') go(state.page, { view: 'all' });
  if (action === 'logout') { if (state.dirty && !closeDialog()) return; await api('/logout', { method: 'POST', body: {} }); state.user = null; closeDialog(true); await auth(); }
  if (action === 'new-item') await openItem();
  if (action === 'open-related') await openItem(id);
  if (action === 'next-page' || action === 'previous-page') go(state.page, { ...state.filters, offset: String(Math.max(0, Number(state.filters.offset || 0) + (action === 'next-page' ? state.pageSize : -state.pageSize))) });
  if (action === 'new-project') modal('新建项目', field('项目名称', input('name', '', 'required maxlength="100"')) + field('项目描述', '<textarea name="description" maxlength="2000" rows="4"></textarea>'), async form => { const result = await api('/projects', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); closeDialog(true); state.projects = await api('/projects'); state.project = result.id; go('workitems', { view: 'all' }); }, '创建项目');
  if (action === 'new-user') modal('创建账号', field('姓名', input('name', '', 'required maxlength="100"')) + field('登录账号', input('login', '', 'required minlength="3" maxlength="100" autocomplete="off"')) + field('初始密码', input('password', '', 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"')) + '<p class="hint">创建后，请通过“添加成员”将账号加入项目。</p>', async form => { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); closeDialog(true); toast('账号已创建'); await render(); }, '创建账号');
  if (action === 'add-member' || action === 'edit-member') { const member = state.meta.members.find(m => m.id === id); modal('项目成员', field('账号', select('user_id', state.allUsers.map(u => option(u.id, `${u.name} (${u.login})`, member?.id)).join(''))) + field('项目角色', select('role', option('editor', '编辑者', member?.role) + option('reader', '只读成员', member?.role))), async form => { const data = Object.fromEntries(new FormData(form)); data.user_id = Number(data.user_id); await api(`/projects/${state.project}/members`, { method: 'POST', body: data }); closeDialog(true); await render(); }); }
  if (action === 'remove-member' && confirm('将此成员移出项目？该成员负责的工作项将变为未分配。')) { await api(`/projects/${state.project}/members/${id}`, { method: 'DELETE', body: {} }); await render(); }
  if (action === 'new-iteration') modal('新建迭代', field('迭代名称', input('name', '', 'required maxlength="100" placeholder="例如：Sprint 2"')) + '<div class="two-fields">' + field('开始日期', input('start_date', '', 'type="date" required')) + field('结束日期', input('end_date', '', 'type="date" required')) + '</div>', async form => { await api(`/projects/${state.project}/iterations`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); closeDialog(true); toast('迭代已创建'); await render(); }, '创建迭代');
  if (action === 'save-query') modal('保存个人查询', field('查询名称', input('name', '', 'required maxlength="100" placeholder="例如：本轮待验收的 Bug"')), async form => { const filters = { ...state.filters }; delete filters.offset; delete filters.item; delete filters.limit; await api(`/projects/${state.project}/queries`, { method: 'POST', body: { name: form.elements.name.value, filters: JSON.stringify(filters) } }); closeDialog(true); toast('查询已保存，可在“查询”中打开'); await render(); });
  if (action === 'delete-query' && confirm('删除这条个人查询？')) { await api(`/projects/${state.project}/queries/${id}`, { method: 'DELETE', body: {} }); await render(); }
  if (action === 'columns') modal('列选项', '<p class="muted">ID、标题和状态始终显示。</p><div class="column-options">' + Object.entries(allColumns).map(([key, label]) => `<label class="check"><input type="checkbox" name="column" value="${key}" ${columns().includes(key) ? 'checked' : ''}>${label}</label>`).join('') + '</div>', async form => { savePref('columns', new FormData(form).getAll('column')); closeDialog(true); await render(); });
  if (action === 'export') {
    const csvCell = value => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
    const csv = [['ID', '标题', '类型', '状态', '负责人', '优先级', 'Area Path', '标签', '更新时间'], ...state.items.map(i => [i.id, i.title, i.type, i.state, i.assignee_name, i.priority, i.area, i.tags, i.changed])].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `work-items-${state.project}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`已导出当前页 ${state.items.length} 个工作项`);
  }
  if (action === 'delete-item' || action === 'restore-item') { const item = state.detail; if (!confirm(action === 'delete-item' ? '将此工作项移入回收站？' : '恢复此工作项？')) return; await api(`/items/${item.id}${action === 'restore-item' ? '/restore' : ''}`, { method: action === 'restore-item' ? 'POST' : 'DELETE', body: { version: item.version } }); closeDialog(true); toast(action === 'delete-item' ? '已移入回收站' : '已恢复'); await render(); }
  if (action === 'add-comment') { const text = $('[name="comment"]', dialog).value.trim(); if (!text) throw Error('请先填写评论'); const item = state.detail; await api(`/items/${item.id}/comments`, { method: 'POST', body: { body: text, version: item.version } }); const updated = await api(`/items/${item.id}`); state.detail.version = item.version + 1; $('[name="comment"]', dialog).value = ''; $('.discussion', dialog).insertAdjacentHTML('beforeend', `<article class="discussion-item">${avatar(state.user.name)}<div><b>${esc(state.user.name)}</b><time>刚刚</time><p>${esc(text)}</p></div></article>`); $('[data-editor-tab="1"] span', dialog).textContent = updated.comments.length; state.dirty = JSON.stringify([...new FormData(document.querySelector('#modal-form'))].filter(([key]) => key !== 'comment')) !== state.editorSnapshot; toast('评论已发送'); }
  if (action === 'account') modal('修改密码', field('当前密码', input('current', '', 'type="password" required autocomplete="current-password"')) + field('新密码', input('password', '', 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"')) + '<p class="hint">修改后，其他设备的登录会话会失效。</p>', async form => { const result = await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); Object.assign(state, result); closeDialog(true); toast('密码已更新'); });
}
document.addEventListener('dragstart', event => { const card = event.target.closest('[data-drag]'); if (!card || !writable() || !card.draggable) return; event.dataTransfer.setData('text/plain', card.dataset.drag); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
document.addEventListener('dragend', () => { document.querySelectorAll('.dragging,.drag-over').forEach(e => e.classList.remove('dragging', 'drag-over')); });
document.addEventListener('dragover', event => { const column = event.target.closest('[data-drop]'); if (column && writable()) { event.preventDefault(); column.classList.add('drag-over'); } });
document.addEventListener('dragleave', event => { const column = event.target.closest('[data-drop]'); if (column && !column.contains(event.relatedTarget)) column.classList.remove('drag-over'); });
document.addEventListener('drop', async event => {
  const column = event.target.closest('[data-drop]'); if (!column || !writable()) return; event.preventDefault(); column.classList.remove('drag-over');
  const item = state.items.find(i => i.id === Number(event.dataTransfer.getData('text/plain'))); if (!item || item.deleted) return;
  const states = state.meta.types[item.type]; const target = column.dataset.drop; const next = target === 'done' ? 'Done' : target === 'review' ? 'Resolved' : target === 'working' ? states.includes('Active') ? 'Active' : 'In Progress' : states[0];
  if (!states.includes(next)) { toast(`${item.type} 没有“待验收”状态，请移入其他列。`); return; } if (next === item.state) return;
  try { await api(`/items/${item.id}`, { method: 'PATCH', body: { state: next, version: item.version } }); toast(`#${item.id} → ${next}`); await render(); } catch (error) { toast(error.message); await render(); }
});
window.addEventListener('hashchange', () => { if (dialog.open && !closeDialog()) { history.replaceState(null, '', state.currentHash || '#'); return; } render(); });
window.addEventListener('DOMContentLoaded', boot, { once: true });
