'use strict';
window.MiniBoards = (() => {
  const levels = { backlog: 'Backlog items', features: 'Features', epics: 'Epics', tasks: 'Tasks / Bugs', bugs: 'Bugs' };
  const levelTypes = { backlog: ['Product Backlog Item'], features: ['Feature'], epics: ['Epic'], tasks: ['Task', 'Bug'], bugs: ['Bug'] };
  let boardData, planningData, boardDraft, backlogItems = [], collapsed = new Set();
  const selectedTeam = () => state.meta.teams.find(t => String(t.id) === String(state.filters.team_id)) || state.meta.teams[0];
  const level = () => levels[state.filters.level] ? state.filters.level : 'backlog';
  function teamBar(extra = '') {
    return `<div class="team-toolbar"><div>${AzureUI.icon('users')}${select('team_id', state.meta.teams.map(t => option(t.id, t.name, selectedTeam()?.id)).join(''), 'data-filter aria-label="团队"')}<span class="divider"></span>${state.page !== 'sprints' ? select('level', Object.entries(levels).map(([v, n]) => option(v, n, level())).join(''), 'data-filter aria-label="待办层级"') : ''}</div><div class="commands">${extra}</div></div>`;
  }
  function tabs(values, active, key = 'tab') { return `<div class="ado-tabs">${Object.entries(values).map(([v, n]) => button('page-tab', n, `data-key="${key}" data-value="${v}" aria-pressed="${v === active}"`, v === active ? 'selected' : 'quiet')).join('')}</div>`; }
  const projectPath = () => `/projects/${state.project}`;
  const boardPath = () => `${projectPath()}/board?team_id=${selectedTeam().id}&level=${level()}`;
  const planPath = () => `${projectPath()}/planning?team_id=${selectedTeam().id}&iteration_id=${state.filters.iteration_id}`;
  async function renderPage(sequence) {
    if (state.page === 'queries') { await MiniQueries.render(sequence); return true; }
    if (!['board', 'backlog', 'sprints'].includes(state.page)) return false;
    const team = selectedTeam(); if (!team) { $('#page-content').innerHTML = empty(); return true; }
    state.filters.team_id = String(team.id);
    if (state.page === 'board') {
      const result = await api(boardPath()); if (sequence !== state.sequence) return true; boardData = result;
      state.items = result.items; state.total = result.total;
      const search = (state.filters.q || '').toLowerCase(); state.items = state.items.filter(i => (!search || `${i.id} ${i.title}`.toLowerCase().includes(search)) && (!state.filters.assignee_id || String(i.assignee_id || 0) === state.filters.assignee_id) && (!state.filters.tag || i.tags.toLowerCase().includes(state.filters.tag.toLowerCase())) && (!state.filters.state || i.state === state.filters.state));
      $('#page-content').innerHTML = teamBar(button('view-backlog', 'View as backlog', '', 'quiet') + (state.user.admin ? button('board-settings', '⚙ 看板设置', '', 'quiet') : '')) + tabs({ board: 'Board', analytics: 'Analytics' }, state.filters.tab || 'board') + boardFilters() + (state.filters.tab === 'analytics' ? boardAnalytics() : renderBoard());
      return true;
    }
    if (state.page === 'backlog') {
      const result = await api(`${projectPath()}/items?team_id=${team.id}&view=all&sort=backlog_rank&dir=asc&limit=500&include_completed=true`); if (sequence !== state.sequence) return true;
      backlogItems = result.items; state.items = result.items; state.total = result.total;
      $('#page-content').innerHTML = teamBar(button('view-board', 'View as Board', '', 'quiet') + button('expand-backlog', '展开全部', '', 'quiet') + button('collapse-backlog', '折叠子项', '', 'quiet')) + tabs({ backlog: 'Backlog', analytics: 'Analytics' }, state.filters.tab || 'backlog') + `<div class="backlog-options"><label class="check"><input type="checkbox" data-backlog-completed ${state.filters.include_completed === 'true' ? 'checked' : ''}> 显示已完成工作项</label><span class="muted">拖动行调整同类型工作项的顺序；拖到右侧迭代安排工作。</span></div>` + (state.filters.tab === 'analytics' ? backlogAnalytics() : backlog()) + (result.total > 500 ? '<p class="notice">已显示前 500 项，请缩小团队 Area Path 范围。</p>' : '');
      return true;
    }
    const iteration = WeeklyPlanning.pick(team);
    if (!iteration) { $('#page-content').innerHTML = teamBar() + `<div class="empty"><h2>为团队创建第一个迭代</h2><p>设置迭代日期后，可规划任务、容量与工作进度。</p>${writable() ? button('new-weekly-iterations', '＋ 创建周迭代', '', 'primary') : ''}</div>`; return true; }
    state.filters.iteration_id = String(iteration.id);
    const result = await api(planPath()); if (sequence !== state.sequence) return true; planningData = result; state.items = result.items; state.total = result.items.length;
    const tab = state.filters.tab || 'taskboard';
    $('#page-content').innerHTML = SprintUI.header(result, teamBar, tabs, tab) + (tab === 'capacity' ? capacity() : tab === 'analytics' ? analytics() : tab === 'backlog' ? sprintBacklog() : taskboard());
    return true;
  }
  function boardFilters() {
    return `<form id="filters" class="filterbar"><span class="search-icon">⌕</span><input name="q" value="${esc(state.filters.q)}" placeholder="按关键词或编号搜索，回车确认" aria-label="关键词"><div class="filter-selects">${select('assignee_id', option('', '所有成员', state.filters.assignee_id) + option('0', '未分配', state.filters.assignee_id) + state.meta.members.map(m => option(m.id, m.name, state.filters.assignee_id)).join(''), 'data-filter aria-label="负责人"')}${select('state', option('', '所有状态', state.filters.state) + [...new Set(boardData.types.flatMap(t => state.meta.types[t]))].map(s => option(s, s, state.filters.state)).join(''), 'data-filter aria-label="状态"')}<input name="tag" value="${esc(state.filters.tag)}" placeholder="标签" class="small-filter" aria-label="标签"></div><button type="submit" class="sr-only">搜索</button></form>`;
  }
  function card(item, mode = 'board') {
    const fields = mode === 'board' ? boardData.definition.card_fields : ['assignee', 'remaining_work'];
    return `<article class="work-card ${typeClass(item.type)} advanced-card" data-drag="${item.id}" draggable="${writable()}"><div class="card-top">${fields.includes('priority') ? `<span class="priority">P${item.priority}</span>` : ''}${item.blocked ? '<span class="blocked">Blocked</span>' : ''}</div><button class="card-title" data-open="${item.id}">${typeIcon(item.type)}<b class="card-id">${item.id}</b>${esc(item.title)}</button><div class="card-state">${dot(item.state, item.type)}</div><div class="card-bottom">${fields.includes('assignee') ? `<span class="person">${avatar(item.assignee_name)}${esc(item.assignee_name || '未分配')}</span>` : ''}${fields.includes('estimate') ? `<span class="estimate" title="Effort">${item.estimate}</span>` : ''}</div>${fields.includes('tags') ? AzureUI.cardTags(item.tags) : ''}${fields.includes('remaining_work') ? `<div class="remaining-work"><span>Remaining Work</span><b>${item.remaining_work}</b></div>` : ''}</article>`;
  }
  function renderBoard() { return NimbusBoard.board(boardData, state.items); }
  function backlog() {
    const allowed = new Set(levelTypes[level()]); const all = backlogItems.filter(i => i.state !== 'Removed' && (state.filters.include_completed === 'true' || i.state !== 'Done')); const byId = new Map(all.map(i => [i.id, i])); const visible = new Set();
    const descendants = id => { for (const child of all.filter(i => i.parent_id === id)) { if (visible.has(child.id)) continue; visible.add(child.id); descendants(child.id); } };
    for (const item of all.filter(i => allowed.has(i.type))) { visible.add(item.id); descendants(item.id); let parent = byId.get(item.parent_id); while (parent) { visible.add(parent.id); parent = byId.get(parent.parent_id); } }
    const rows = []; const visit = (item, depth) => { rows.push({ item, depth }); if (!collapsed.has(item.id)) for (const child of all.filter(i => i.parent_id === item.id && visible.has(i.id))) visit(child, depth + 1); };
    for (const item of all.filter(i => visible.has(i.id) && !visible.has(i.parent_id))) visit(item, 0);
    return `<div class="backlog-layout"><div class="table-wrap"><table class="work-table backlog-table"><thead><tr><th>Order</th><th>Work Item Type</th><th>Title</th><th>State</th><th>Effort</th><th>Iteration</th><th></th></tr></thead><tbody>${rows.map(({ item, depth }, n) => `<tr data-reorder="${item.id}" data-drag="${item.id}" draggable="${writable()}"><td class="rank-cell">${n + 1}${writable() ? button('rank-up', '↑', `data-id="${item.id}" aria-label="上移工作项"`, 'quiet') : ''}</td><td>${typeIcon(item.type)} ${esc(typeNames[item.type])}</td><td><div class="backlog-title depth-${Math.min(depth, 4)}">${all.some(i => i.parent_id === item.id && visible.has(i.id)) ? button('toggle-parent', collapsed.has(item.id) ? '›' : '⌄', `data-id="${item.id}" aria-label="展开或折叠子项"`, 'quiet tree-toggle') : '<span class="tree-spacer"></span>'}<button class="item-title" data-open="${item.id}"><span class="muted">${item.id}</span>${esc(item.title)}</button></div></td><td>${dot(item.state, item.type)}</td><td>${item.estimate}</td><td>${esc(state.meta.iterations.find(i => i.id === item.iteration_id)?.name || '未安排')}</td><td>${writable() ? button('add-child', '＋', `data-id="${item.id}" aria-label="添加子工作项"`, 'quiet') : ''}</td></tr>`).join('')}</tbody></table>${rows.length ? '' : empty()}</div><aside class="planning-pane"><h3>Planning</h3>${writable() ? button('new-weekly-iterations','＋ 创建周迭代','','quiet') : ''}<p>拖动工作项到迭代</p><div class="iteration-drop" data-iteration-drop="0"><b>未安排迭代</b></div>${state.meta.iterations.map(i => `<div class="iteration-drop" data-iteration-drop="${i.id}"><b>${esc(i.name)}</b><small>${esc(i.start_date)} — ${esc(i.end_date)}</small><span>${backlogItems.filter(item => item.iteration_id === i.id).length} 个工作项</span></div>`).join('')}</aside></div>`;
  }
  function taskboard() {
    return SprintUI.taskboard(planningData);
  }
  function sprintBacklog() { return `<div class="sprint-backlog"><p class="muted">选择任务查看详情、估算剩余工作量或重新安排迭代。</p>${table()}</div>`; }
  function capacity() { return CapacityUI.render(planningData); }
  function lineChart(series) {
    const width = 1000, height = 250, left = 55, top = 20, bottom = 35, plot = height - top - bottom;
    const max = Math.max(1, ...series.flatMap(p => [p.remaining || 0, p.ideal || 0])); const x = i => left + i * (width - left - 20) / Math.max(1, series.length - 1); const y = v => top + plot - v / max * plot;
    const path = key => { let connected = false; return series.map((p, i) => { if (p[key] == null) { connected = false; return ''; } const point = `${connected ? 'L' : 'M'}${x(i)},${y(p[key])}`; connected = true; return point; }).join(' '); };
    return `<svg class="burndown-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="燃尽图：蓝色为实际剩余工作，灰色虚线为理想趋势">${[0, 1, 2, 3, 4].map(n => `<line x1="${left}" x2="980" y1="${y(max * n / 4)}" y2="${y(max * n / 4)}" class="chart-grid"/><text x="45" y="${y(max * n / 4) + 4}" text-anchor="end">${Math.round(max * n / 4 * 10) / 10}</text>`).join('')}<path d="${path('ideal')}" class="ideal-line"/><path d="${path('remaining')}" class="actual-line"/>${series.map((p, i) => `${p.remaining == null ? '' : `<circle cx="${x(i)}" cy="${y(p.remaining)}" r="3" class="chart-point"><title>${p.date}: ${p.remaining} h</title></circle>`}${i % Math.max(1, Math.ceil(series.length / 8)) === 0 || i === series.length - 1 ? `<text x="${x(i)}" y="242" text-anchor="middle">${p.date.slice(5)}</text>` : ''}`).join('')}</svg>`;
  }
  function analytics() { const a = planningData.analytics; return `<section class="analytics-card"><h2>Burndown Trend</h2><p>${esc(planningData.iteration.start_date)} — ${esc(planningData.iteration.end_date)} · Remaining Work</p><div class="analytics-stats"><div><strong>${a.remaining}</strong><span>Remaining hours</span></div><div><strong>${a.scope}</strong><span>当前估算范围</span></div><div><strong>${a.unestimated}</strong><span>未填写剩余工作量</span></div></div>${lineChart(a.series)}<div class="chart-legend"><span>● 实际剩余工作</span><span>┄ 理想趋势（当前估算范围）</span></div><p class="hint">历史从 ${esc(a.coverage_start)} 开始记录；没有历史数据的日期及未来日期留空。当前工作量增加时，理想线会按当前范围重新计算。</p><details><summary>查看每日数据</summary><table class="work-table"><thead><tr><th>日期</th><th>实际剩余</th><th>理想剩余</th><th>工作日</th></tr></thead><tbody>${a.series.map(s => `<tr><td>${s.date}</td><td>${s.remaining ?? '—'}</td><td>${s.ideal}</td><td>${s.working ? '是' : '否'}</td></tr>`).join('')}</tbody></table></details></section>`; }
  function countsChart(items, title) { const counts = new Map(); for (const i of items) counts.set(i.state, (counts.get(i.state) || 0) + 1); const max = Math.max(1, ...counts.values()); return `<section class="analytics-card"><h2>${title}</h2><p class="muted">当前筛选范围内的工作项分布</p><svg class="distribution-chart" viewBox="0 0 900 ${counts.size * 40 + 20}" role="img" aria-label="按状态统计工作项">${[...counts].map(([name, count], index) => `<text x="120" y="${index * 40 + 26}" text-anchor="end">${esc(name)}</text><rect x="135" y="${index * 40 + 8}" width="${count / max * 680}" height="24" rx="2"/><text x="${145 + count / max * 680}" y="${index * 40 + 25}">${count}</text>`).join('')}</svg></section>`; }
  function boardAnalytics() { return countsChart(state.items, 'Work by state'); }
  function backlogAnalytics() { return countsChart(backlogItems.filter(i => levelTypes[level()].includes(i.type)), 'Backlog by state'); }
  function readBoardForm() {
    const form = $('#modal-form'); if (!form) return;
    boardDraft.columns.forEach((c, i) => { c.name = form.elements[`column-${i}-name`].value; c.limit = Number(form.elements[`column-${i}-limit`].value); c.split = form.elements[`column-${i}-split`].checked; c.description = form.elements[`column-${i}-description`].value; c.mappings = Object.fromEntries(boardData.types.map((t, n) => [t, form.elements[`column-${i}-map-${n}`].value]).filter(([, value]) => value)); });
    boardDraft.lanes.forEach((lane, i) => { lane.name = form.elements[`lane-${i}`].value; }); boardDraft.card_fields = new FormData(form).getAll('card-field');
  }
  function boardSettings(reopen = false) {
    if (!reopen) boardDraft = structuredClone(boardData.definition);
    modal('看板设置 · Columns / Swimlanes / Cards', `<p class="hint">列名称与工作项状态可以不同。WIP 超限显示提醒；不会阻止团队继续移动卡片。</p><div class="board-settings-columns">${boardDraft.columns.map((c, i) => `<section class="column-config"><div class="config-heading"><b>列 ${i + 1}</b>${button('config-up', '↑', `data-index="${i}" ${i === 0 ? 'disabled' : ''}`, 'quiet')}${button('config-remove', '移除', `data-index="${i}"`, 'quiet danger')}</div><div class="two-fields">${field('名称', input(`column-${i}-name`, c.name, 'required maxlength="60"'))}${field('WIP 上限（0 = 无上限）', input(`column-${i}-limit`, c.limit, 'type="number" min="0" max="10000"'))}</div>${boardData.types.map((t, n) => field(`${esc(t)} 状态映射`, select(`column-${i}-map-${n}`, option('', '不接受此类型', c.mappings[t]) + state.meta.types[t].filter(s => s !== 'Removed').map(s => option(s, s, c.mappings[t])).join('')))).join('')}<label class="check"><input name="column-${i}-split" type="checkbox" ${c.split ? 'checked' : ''}> 拆分为 Doing / Done</label>${field('Definition of done · 完成定义', `<textarea name="column-${i}-description" rows="2" maxlength="2000">${esc(c.description)}</textarea>`)}</section>`).join('')}</div>${button('config-add', '＋ 添加列')}<h3>Swimlanes</h3><div class="lane-config">${boardDraft.lanes.map((l, i) => `<div>${input(`lane-${i}`, l.name, 'required maxlength="60"')}${button('lane-remove', '×', `data-index="${i}"`, 'quiet')}</div>`).join('')}</div>${button('lane-add', '＋ 添加泳道')}<h3>Cards</h3><div class="card-field-options">${Object.entries({ assignee: '负责人', tags: '标签', estimate: 'Effort', remaining_work: 'Remaining Work', priority: '优先级' }).map(([key, label]) => `<label class="check"><input name="card-field" value="${key}" type="checkbox" ${boardDraft.card_fields.includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</div>`, async () => { readBoardForm(); await api(boardPath(), { method: 'PUT', body: { definition: boardDraft, version: boardData.version } }); closeDialog(true); toast('看板配置已保存'); await render(); }, '保存配置', true);
  }
  function enhanceSettings() {
    const grid = $('.settings-grid'); if (!grid) return;
    grid.insertAdjacentHTML('afterbegin', `<section class="settings-card"><div class="section-heading"><div><h2>Teams / Area Paths</h2><p>每个团队有独立的看板配置、工作范围和容量。</p></div>${state.user.admin ? button('new-team', '＋ 新建团队') : ''}</div>${state.meta.teams.map(t => `<div class="team-setting-row"><div><b>${esc(t.name)}</b><p>${JSON.parse(t.areas).map(esc).join('<br>') || '项目下的所有 Area Path'}</p></div>${state.user.admin ? button('edit-team', '编辑', `data-id="${t.id}"`, 'quiet') : ''}</div>`).join('')}</section>`);
  }
  const oldHandle = handle;
  handle = async (action, element) => {
    const id = Number(element.dataset.id);
    if (action === 'page-tab') return go(state.page, { ...state.filters, [element.dataset.key]: element.dataset.value });
    if (action === 'view-backlog' || action === 'view-board') { const filters = { ...state.filters }; delete filters.tab; return go(action === 'view-backlog' ? 'backlog' : 'board', filters); }
    if (action === 'board-settings') return boardSettings();
    if (['config-up', 'config-remove', 'config-add', 'lane-add', 'lane-remove'].includes(action)) {
      readBoardForm(); const index = Number(element.dataset.index);
      if (action === 'config-up' && index > 0) [boardDraft.columns[index - 1], boardDraft.columns[index]] = [boardDraft.columns[index], boardDraft.columns[index - 1]];
      if (action === 'config-remove' && boardDraft.columns.length > 2) boardDraft.columns.splice(index, 1);
      if (action === 'config-add' && boardDraft.columns.length < 12) boardDraft.columns.push({ id: crypto.randomUUID(), name: '新列', limit: 5, split: false, description: '', mappings: Object.fromEntries(boardData.types.map(t => [t, state.meta.types[t][0]])) });
      if (action === 'lane-add' && boardDraft.lanes.length < 8) boardDraft.lanes.push({ id: crypto.randomUUID(), name: '新泳道' });
      if (action === 'lane-remove' && boardDraft.lanes.length > 1) boardDraft.lanes.splice(index, 1);
      return boardSettings(true);
    }
    if (action === 'quick-item') {
      const col = boardData.definition.columns.find(c => c.id === element.dataset.column); const lane = element.dataset.lane;
      return modal('New work item', field('类型', select('type', Object.keys(col.mappings).map(t => option(t, t, boardData.types[0])).join(''))) + field('标题', input('title', '', 'required maxlength="300"')) + field('负责人', select('assignee_id', option('', '未分配', '') + state.meta.members.map(m => option(m.id, m.name, state.user.id)).join(''))), async form => {
        const type = form.elements.type.value; const created = await api(projectPath() + '/items', { method: 'POST', body: { type, title: form.elements.title.value, assignee_id: Number(form.elements.assignee_id.value) || null, state: col.mappings[type], area: JSON.parse(selectedTeam().areas)[0] || state.meta.project.name } });
        await api(boardPath(), { method: 'POST', body: { item_id: created.id, version: created.version, board_version: boardData.version, column_id: col.id, lane_id: lane, column_done: 0 } }); closeDialog(true); await render();
      }, '创建');
    }
    if (action === 'toggle-parent') { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); return render(); }
    if (action === 'collapse-backlog') { collapsed = new Set(backlogItems.filter(i => backlogItems.some(c => c.parent_id === i.id)).map(i => i.id)); return render(); }
    if (action === 'expand-backlog') { collapsed.clear(); return render(); }
    if (action === 'rank-up') {
      const item = backlogItems.find(i => i.id === id); const siblings = backlogItems.filter(i => i.type === item.type); const index = siblings.findIndex(i => i.id === id); if (index < 1) return;
      await api(projectPath() + '/reorder', { method: 'POST', body: { id, version: item.version, before_id: siblings[index - 1].id } }); return render();
    }
    if (action === 'new-team' || action === 'edit-team') {
      const team = state.meta.teams.find(t => t.id === id); const days = team ? JSON.parse(team.working_days) : [1, 2, 3, 4, 5];
      return modal('团队设置', field('团队名称', input('name', team?.name || '', 'required maxlength="100"')) + field('Area Paths · 每行一个，包含其下级路径', `<textarea name="areas" rows="4" placeholder="留空表示项目下所有区域">${esc(team ? JSON.parse(team.areas).join('\n') : '')}</textarea>`) + field('默认迭代', select('default_iteration_id', option('', '自动选择当前迭代', team?.default_iteration_id) + state.meta.iterations.map(i => option(i.id, i.name, team?.default_iteration_id)).join(''))) + '<div class="weekday-options">' + ['日', '一', '二', '三', '四', '五', '六'].map((day, i) => `<label class="check"><input type="checkbox" name="working_days" value="${i}" ${days.includes(i) ? 'checked' : ''}>周${day}</label>`).join('') + '</div>', async form => { const data = Object.fromEntries(new FormData(form)); data.default_iteration_id = Number(data.default_iteration_id) || null; data.working_days = new FormData(form).getAll('working_days').map(Number); await api(projectPath() + '/teams' + (team ? '/' + team.id : ''), { method: team ? 'PATCH' : 'POST', body: data }); closeDialog(true); await render(); });
    }
    return oldHandle(action, element);
  };
  document.addEventListener('change', event => { if (event.target.hasAttribute('data-backlog-completed')) go('backlog', { ...state.filters, include_completed: String(event.target.checked) }); });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'capacity-form') return; event.preventDefault(); event.stopImmediatePropagation(); const form = event.target; const submit = [...form.elements].find(control => control.matches('[data-capacity-save]')); if (!submit || submit.disabled) return; submit.disabled = true;
    await CapacityUI.save();
  }, true);
  document.addEventListener('dragover', event => { const target = event.target.closest('[data-board-drop],[data-task-state],[data-iteration-drop],[data-reorder]'); if (target && writable()) { event.preventDefault(); target.classList.add('drag-over'); } });
  document.addEventListener('dragleave', event => { const target = event.target.closest('[data-board-drop],[data-task-state],[data-iteration-drop],[data-reorder]'); if (target && !target.contains(event.relatedTarget)) target.classList.remove('drag-over'); });
  document.addEventListener('drop', async event => {
    const target = event.target.closest('[data-board-drop],[data-task-state],[data-iteration-drop],[data-reorder]'); if (!target || !writable()) return; event.preventDefault(); event.stopImmediatePropagation(); target.classList.remove('drag-over');
    const id = Number(event.dataTransfer.getData('text/plain')); const item = state.items.find(i => i.id === id); if (!item) return;
    try {
      if (target.dataset.boardDrop) await api(boardPath(), { method: 'POST', body: { item_id: id, version: item.version, board_version: boardData.version, column_id: target.dataset.boardDrop, lane_id: target.dataset.lane, column_done: Number(target.dataset.done) } });
      else if (target.dataset.taskState) { if (!state.meta.types[item.type].includes(target.dataset.taskState)) throw Error(`${item.type} 不支持 ${target.dataset.taskState} 状态`); await api(`/items/${id}`, { method: 'PATCH', body: { version: item.version, state: target.dataset.taskState } }); }
      else if (target.hasAttribute('data-iteration-drop')) { await WeeklyPlanning.schedule(id, Number(target.dataset.iterationDrop) || null); return; }
      else if (target.dataset.reorder && Number(target.dataset.reorder) !== id) await api(projectPath() + '/reorder', { method: 'POST', body: { id, version: item.version, before_id: Number(target.dataset.reorder) } });
      await render(); toast('更改已保存');
    } catch (error) { toast(error.message); await render(); }
  }, true);
  return { renderPage, enhanceSettings, selectedTeam, level };
})();
