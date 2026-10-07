'use strict';
// Azure Boards presentation. Existing actions, forms and API behavior are shared.
window.AzureUI = (() => {
  const paths = {
    mail: '<rect x="1" y="3" width="14" height="10" rx="1"/><path d="m1 4 7 5 7-5"/>',
    check: '<path d="m2 8 4 4 8-8"/>',
    team: '<circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><path d="M1 10c0-2 8-2 8 0v3H1zM10 9c2-1 5 0 5 2v2h-4"/>',
    boardsNav: '<rect x="1" y="2" width="5" height="2" rx=".5"/><rect x="10" y="2" width="5" height="2" rx=".5"/><rect x="1" y="7" width="5" height="2" rx=".5"/><rect x="10" y="7" width="5" height="2" rx=".5"/><rect x="1" y="12" width="5" height="2" rx=".5"/>',
    backlogView: '<circle cx="8" cy="8" r="6.5"/><path d="M4 8h7M8 5l3 3-3 3"/>',
    edit: '<path d="m2 10 9-9 4 4-9 9-5 1zM9 3l4 4"/>',
    star: '<path d="m8 1 2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8 3.8 14l.8-4.7L1.2 6l4.7-.7z"/>',
    cardFields: '<rect x="1" y="4" width="14" height="8"/><path d="M3 6h3v3H3zM8 6h5M8 9h5"/>',
    calendar: '<rect x="1" y="3" width="14" height="12" rx="2"/><path d="M4 1v4M12 1v4M1 7h14M4 10h2m3 0h2m-7 3h2"/>',
    chevronLeft: '<path d="m10 3-5 5 5 5"/>', chevronRight: '<path d="m6 3 5 5-5 5"/>',
    plus: '<path d="M8 1v14M1 8h14"/>', chevron: '<path d="m4 6 4 4 4-4"/>',
    minus: '<path d="M1 8h14"/>',
    arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>', back: '<path d="m6 3-5 5 5 5M1 8h13"/>',
    openQuery: '<path d="M10 1l4 4-4 4M14 5H6a5 5 0 0 0 0 10"/>',
    query: '<path d="M1 3h5M1 7h4M1 11h7M1 15h13"/><circle cx="10" cy="6" r="4"/><path d="m13 9 3 3"/>',
    columns: '<path d="m9 2 2-1 3 3-1 2-3 1-6 7-2-2 7-6zM11 1l-1 3 2 2 3-1"/>',
    upload: '<path d="M8 15V1M3 6l5-5 5 5M3 1h10"/>', download: '<path d="M8 1v12M3 8l5 5 5-5M2 15h12"/>',
    trash: '<path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10M7 6v6M9 6v6"/>',
    filter: '<path d="M2 4h12M4 8h8M6 12h4"/>', close: '<path d="m3 3 10 10M13 3 3 13"/>',
    sliders: '<path d="M1 4h4m4 0h6M1 12h8m4 0h2M5 2v4h4V2zM9 10v4h4v-4z"/>',
    expand: '<path d="M9 2h5v5M14 2 8 8M7 14H2V9M2 14l6-6"/>',
    refresh: '<path d="M13 5a6 6 0 1 0 1 5M13 1v4H9"/>',
    search: '<circle cx="6.5" cy="6.5" r="4.5"/><path d="m10 10 4 4"/>',
    follow: '<path d="M1 8s2-4 7-4 7 4 7 4-2 4-7 4-7-4-7-4z"/><circle cx="8" cy="8" r="2"/>',
    verticalMore: '<circle cx="8" cy="3" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="8" cy="13" r=".8" fill="currentColor"/>',
    copy: '<rect x="5" y="1" width="8" height="11" rx="1"/><path d="M3 4H2v10a1 1 0 0 0 1 1h7v-1"/>',
    link: '<path d="M6 4H4a4 4 0 0 0 0 8h2M10 4h2a4 4 0 0 1 0 8h-2M5 8h6"/>',
    changeType: '<path d="M2 4h11M10 1l3 3-3 3M14 12H3m3-3-3 3 3 3"/>',
    linkedItem: '<path d="M5 2H3v13h5M10 2h3v5M5 1h5v3H5z"/><circle cx="11" cy="11" r="4"/><path d="m9 11 1.5 1.5 2.5-3"/>',
    more: '<circle cx="3" cy="8" r=".7"/><circle cx="8" cy="8" r=".7"/><circle cx="13" cy="8" r=".7"/>',
    warning: '<path d="M8 1 15 14H1zM8 5v4M8 11v.5"/>',
    help: '<circle cx="8" cy="8" r="6"/><path d="M6 5a2 2 0 0 1 4 0c0 2-2 2-2 4M8 11v.5"/>',
    marketplace: '<path d="M3 5h10v10H3zM6 6V3a2 2 0 0 1 4 0v3M8 5v10"/>',
    users: '<circle cx="6" cy="5" r="2"/><path d="M2 13v-2a4 4 0 0 1 8 0v2M12 3a2 2 0 0 1 0 4M13 9v5m-2-3h4"/>',
    external: '<path d="M9 1h6v6M15 1 7 9M6 3H2v11h11v-4"/>',
    comment: '<path d="M2 5h9v6H6l-3 3v-3H2zM5 5V2h9v7h-3"/>',
    save: '<path d="M2 1h10l2 2v12H2zM5 1v5h6V1M5 15V9h6v6"/>',
    undo: '<path d="M5 3 1 7l4 4M1 7h8a5 5 0 0 1 0 10" transform="translate(0 -2)"/>',
    lock: '<rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V4a3 3 0 0 1 6 0v3M8 10v2"/>',
    settings: '<path d="m6 1 4 0 .5 2 2 .8 1.8 2.8-1.5 1.5.2 2-2 3.1-2-.5-2 .8-3.5-1.8.3-2-1.3-1.7.4-3.5 2-.5z"/><circle cx="8" cy="8" r="2.3"/>',
    logout: '<path d="M7 2H2v12h5M5 8h9m-4-4 4 4-4 4"/>',
    menu: '<path d="m5 4 4 4-4 4m4-8 4 4-4 4"/>',
    list: '<path d="M5 3h9M5 8h9M5 13h9M1 3h1M1 8h1M1 13h1"/>',
    sprint: '<circle cx="8" cy="8" r="6"/><path d="M8 3v5h4"/>',
    board: '<rect x="1" y="2" width="14" height="12" rx="1"/><path d="M6 2v12M11 2v12M3 5h1M8 5h1M13 5h1M3 8h1M8 8h1"/>',
    folder: '<path d="M1 4V2h5l2 2h7v10H1z"/>',
    bug: '<path d="M5 5h6v6a3 3 0 0 1-6 0zM6 5V3h4v2M8 6v8M3 5l2 2M13 5l-2 2M2 9h3m6 0h3M3 14l2-2m6 0 2 2M5 1l1 2m4 0 1-2"/>',
    task: '<path fill="currentColor" stroke="none" d="M3 2h3V1h4v1h3v13H3z"/><path stroke="white" d="m5 8 2 2 4-5M6 3h4"/>',
    pbi: '<path fill="currentColor" stroke="none" d="M2 1h12v14H2z"/><path stroke="white" d="M4 4h1m2 0h5M4 7h1m2 0h5M4 10h1m2 0h5M4 13h1m2 0h5"/>',
    feature: '<path fill="currentColor" stroke="none" d="M3 1h10v6l-4 4v3h3v1H4v-1h3v-3L3 7z"/><path d="M3 3H1v3l4 3M13 3h2v3l-4 3"/>',
    epic: '<path fill="currentColor" stroke="none" d="m9 0-7 9h5l-1 7 8-10H9z"/>'
  };
  function icon(name, css = '') { return `<svg class="ui-icon ${css}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.list}</svg>`; }
  function typeIcon(type) { return `<span class="type-icon ${typeClass(type)}" title="${esc(type)}">${icon(typeClass(type))}</span>`; }
  function productIcon(page) {
    if (page === 'workitems' || page === 'board') return `<img class="azure-product-icon" src="/assets/azure/${page === 'workitems' ? 'overview' : 'boards'}.svg" width="24" height="24" alt="">`;
    const shape = { workitems: 'list', board: 'board', backlog: 'folder', sprints: 'sprint', queries: 'search', settings: 'settings' }[page];
    return `<span class="product-icon product-${page}">${icon(shape)}</span>`;
  }
  const command = (action, label, glyph, extra = '') => button(action, icon(glyph) + `<span>${label}</span>`, extra, 'quiet');
  function referenceNotice() {
    return `<aside class="workspace-notice" aria-label="Azure DevOps organization notice">${icon('warning')}<p><strong>Azure DevOps notice:</strong> User identities will be removed from the Azure DevOps Personal Access Token (PAT) allowlist by the end of CY26 (December 31, 2026) and service accounts by the end of FY27 (June 30, 2027).<br>For guidance and the original organization announcement, <a href="https://msdata.visualstudio.com/Vienna/_workitems/assignedtome/" target="_blank" rel="noopener noreferrer">open Azure DevOps</a>. This announcement concerns Azure DevOps authentication.</p>${command('dismiss-notice', '', 'close', 'aria-label="Dismiss Azure DevOps notice"')}</aside>`;
  }
  function newItemCommand() {
    return `<div class="new-item-command">${command('new-item', 'New Work Item', 'plus')}<details class="overflow-menu new-item-menu"><summary aria-label="选择新工作项类型">${icon('chevron')}</summary><div>${Object.keys(state.meta.types).map(type => button('new-item-type', typeIcon(type) + esc(type), `data-type="${esc(type)}"`, 'quiet')).join('')}</div></details></div>`;
  }
  function globalSearch() {
    const value = state.page === 'workitems' ? state.filters.q || '' : '';
    return `<form id="global-search" class="global-search" role="search" aria-label="Search work items in current project">${command('focus-search', '', 'search', 'aria-label="Search work items" title="Search work items"')}<input type="search" name="search" aria-label="Search work items by title or ID" placeholder="Search" title="${esc(state.meta.project.name)} · Search work items by title or ID" value="${esc(value)}" maxlength="300" autocomplete="off"><button type="submit" class="sr-only">Search</button></form>`;
  }
  let rowMenu, rowMenuTrigger, rowMenuItems = [];
  function closeRowMenu(focus = false) {
    rowMenu?.remove();rowMenu=null;
    rowMenuTrigger?.setAttribute('aria-expanded','false');
    if(focus&&rowMenuTrigger?.isConnected)rowMenuTrigger.focus();
  }
  function showRowMenu(element) {
    if(rowMenu&&rowMenuTrigger===element){closeRowMenu(true);return;}
    closeRowMenu();rowMenuTrigger=element;
    const id=Number(element.dataset.id),checked=[...document.querySelectorAll('[data-select-item]:checked')].map(e=>Number(e.dataset.selectItem));
    const ids=checked.includes(id)?checked:[id];rowMenuItems=state.items.filter(i=>ids.includes(i.id));
    if(!rowMenuItems.length)return;
    element.setAttribute('aria-expanded','true');element.setAttribute('aria-haspopup','menu');element.setAttribute('aria-controls','workitem-row-menu');
    rowMenu=document.createElement('div');rowMenu.id='workitem-row-menu';rowMenu.className='workitem-row-menu';rowMenu.setAttribute('role','menu');rowMenu.setAttribute('aria-label','More Actions');rowMenu.setAttribute('popover','manual');
    const item=(action,label,glyph,attrs='')=>button(action,icon(glyph)+`<span>${label}</span>`,`role="menuitem" ${attrs}`,'quiet');
    const links=rowMenuItems.map(i=>`${i.id} ${i.title}\n${location.origin}/#/workitems?project=${state.project}&item=${i.id}`).join('\n\n');
    const email='mailto:?subject='+encodeURIComponent(rowMenuItems.length===1?rowMenuItems[0].title:'Work items')+'&body='+encodeURIComponent(links);
    rowMenu.innerHTML=item('row-query','Open selected items in Queries','openQuery')+item('row-copy-selection','Copy to clipboard','copy')+`<a role="menuitem" href="${esc(email)}" title="Open a draft in your email app">${icon('mail')}<span>Email...</span></a>`+item('row-delete','Delete','trash',writable()&&!rowMenuItems.some(i=>i.deleted)?'':'disabled');
    document.body.append(rowMenu);rowMenu.showPopover?.();
    const anchor=element.getBoundingClientRect(),rect=rowMenu.getBoundingClientRect();
    const left=Math.max(8,Math.min(anchor.left,innerWidth-rect.width-8));
    const top=anchor.bottom+rect.height<=innerHeight-8?anchor.bottom:Math.max(8,anchor.top-rect.height);
    rowMenu.style.left=left+'px';rowMenu.style.top=top+'px';
    rowMenu.querySelector('[role=menuitem]')?.focus();
  }
  Object.assign(names, { workitems: 'Work items', board: 'Boards', backlog: 'Backlogs', sprints: 'Sprints', queries: 'Queries', settings: 'Project settings' });
  Object.assign(allColumns, { type: 'Work Item Type', assignee: 'Assigned To', priority: 'Priority', tags: 'Tags', comments: 'Comments', changed: 'Changed Date', iteration: 'Iteration Path' });

  shell = function () {
    closeRowMenu();
    document.title = `${names[state.page]} · ${state.meta.project.name} · Mini DevOps`;
    const expanded = pref('navigation-expanded', false);
    const boardLinks = Object.entries(names).filter(([key]) => !['settings','boards-directory'].includes(key)).map(([key,label]) => `<a class="board-nav-link ${state.page === key ? 'selected' : ''}" href="#/${key}?project=${state.project}" ${state.page === key ? 'aria-current="page"' : ''}>${icon({workitems:'list',board:'board',backlog:'list',sprints:'sprint',queries:'query',delivery:'calendar'}[key])}${label}</a>`).join('');
    const nav = `<a href="#/workitems?project=${state.project}" class="nav-item" aria-label="Work items" title="Work items">${productIcon('workitems')}<span class="nav-label">Work items</span></a><div class="boards-navigation"><button type="button" data-action="boards-navigation" class="nav-item ${state.page !== 'settings' ? 'selected' : ''}" aria-label="Boards navigation" aria-expanded="false" aria-haspopup="true" title="Boards">${productIcon('board')}<span class="nav-label">Boards</span></button><div class="boards-flyout"><h2>Boards</h2>${boardLinks}</div></div>`;
    app.innerHTML = `<div class="azure-shell ${expanded ? 'nav-expanded' : ''} ${pref('reference-notice-dismissed', false) ? 'notice-dismissed' : ''}" data-page="${state.page}"><header class="topbar"><a class="brand" href="#/workitems?project=${state.project}" aria-label="Mini DevOps" title="Mini DevOps"><img src="/assets/azure/brand.svg" width="24" height="24" alt=""></a><div class="breadcrumbs"><a href="#/workitems?project=${state.project}">Mini DevOps</a><span>/</span>${select('project', state.projects.map(p => option(p.id, p.name, state.project)).join(''), 'aria-label="当前项目"')}<span>/</span>${!["board","boards-directory"].includes(state.page) ? `<a class="breadcrumb-area" href="#/board?project=${state.project}" title="Open Boards">Boards</a><span>/</span>` : ""}<a class="breadcrumb-current" href="#/${state.page}?project=${state.project}" aria-current="page" title="Open ${names[state.page]}">${names[state.page]}</a></div><div class="top-user">${globalSearch()}${command('refresh', '', 'refresh', 'aria-label="Refresh" title="Refresh"')}${command('show-help', '', 'help', 'aria-label="Help" title="Help"')}${command('project-settings', '', 'users', 'aria-label="Project members" title="Project members"')}<details class="overflow-menu user-menu"><summary aria-label="Account manager" title="${esc(state.user.name)}">${avatar(state.user.name)}</summary><div><p class="account-name">${esc(state.user.name)}</p>${command('account', 'Change password', 'settings')}${command('logout', 'Sign out', 'logout', 'aria-label="退出登录"')}</div></details></div></header>${referenceNotice()}<aside class="sidebar" aria-label="Project navigation"><a class="rail-project" href="#/workitems?project=${state.project}" title="${esc(state.meta.project.name)}"><span>${esc(state.meta.project.name.slice(0, 1).toUpperCase())}</span><b>${esc(state.meta.project.name)}</b></a>${state.user.admin ? command('new-project', 'New project', 'plus', 'aria-label="新建项目" title="New project"') : ''}<div class="rail-separator"></div><nav aria-label="项目导航">${nav}</nav><div class="rail-bottom"><a class="nav-item ${state.page === 'settings' ? 'selected' : ''}" href="#/settings?project=${state.project}" title="Project settings" aria-label="Project settings">${icon('settings')}<span class="nav-label">Project settings</span></a>${command('toggle-navigation', expanded ? 'Collapse navigation' : 'Expand navigation', 'menu', `aria-label="${expanded ? '收起' : '展开'}导航" aria-expanded="${expanded}"`)}</div></aside><main><div class="page-heading"><h1>${names[state.page]}</h1><div class="heading-actions">${state.page !== 'workitems' && writable() ? newItemCommand() : ''}</div></div><div id="page-content"><div class="loading">正在加载工作项…</div></div></main></div>`;
  };

  toolbar = function () {
    const f = state.filters;
    const views = [['mine', 'Assigned to me'], ['all', 'All work items'], ['created', 'Created by me'], ['following', 'Following'], ['recent', 'Recently viewed'], ['recycle', 'Recycle Bin']];
    return `<div class="commandbar"><div class="view-picker">${select('view', views.map(([v, label]) => option(v, label, f.view || 'mine')).join(''), 'data-filter aria-label="工作项视图"')}<span class="divider"></span></div><div class="commands">${writable() ? newItemCommand() : ''}${command('open-query-editor', 'Open in Queries', 'query')}${command('columns', 'Column Options', 'columns')}${writable() ? command('import-items', 'Import Work Items', 'upload') : ''}${command('recycle-bin', 'Recycle Bin', 'trash')}</div><div class="command-options">${command('advanced-filters', '', 'sliders', 'aria-label="更多筛选" title="Filter options" aria-expanded="false"')}${command('toggle-filters', '', 'filter', 'aria-label="显示或隐藏筛选" title="Toggle filters" aria-expanded="true"')}${command('full-screen', '', 'expand', 'aria-label="切换全屏" title="Full screen"')}<details class="overflow-menu"><summary aria-label="更多工作项操作" title="More actions">${icon('more')}</summary><div>${command('refresh', 'Refresh', 'refresh')}${command('save-query', 'Save query', 'save')}${command('export', 'Export to CSV', 'download')}</div></details></div></div><form id="filters" class="filterbar"><span class="search-icon">${icon('filter')}</span><input name="q" aria-label="关键词" placeholder="Filter by keyword" value="${esc(f.q)}"><div class="filter-selects">${select('type', option('', 'Types', f.type) + Object.keys(state.meta.types).map(t => option(t, typeNames[t], f.type)).join(''), 'data-filter aria-label="类型"')}${select('state', option('', 'States', f.state) + [...new Set(Object.values(state.meta.types).flat())].map(s => option(s, s, f.state)).join(''), 'data-filter aria-label="状态"')}<label class="text-filter"><input name="area" class="small-filter" aria-label="Area Path" placeholder="Area" value="${esc(f.area)}">${icon('chevron')}</label><label class="text-filter"><input name="tag" class="small-filter" aria-label="标签" placeholder="Tags" value="${esc(f.tag)}">${icon('chevron')}</label>${command('clear-filters', '', 'close', 'aria-label="清除筛选" title="Clear filters"')}</div><div class="advanced-filters" hidden>${select('assignee_id', option('', 'Assigned To: All', f.assignee_id) + option('0', 'Unassigned', f.assignee_id) + state.meta.members.map(m => option(m.id, m.name, f.assignee_id)).join(''), 'data-filter aria-label="负责人"')}${select('iteration_id', option('', 'Iteration: All', f.iteration_id) + option('0', 'Unassigned', f.iteration_id) + state.meta.iterations.map(i => option(i.id, i.name, f.iteration_id)).join(''), 'data-filter aria-label="迭代"')}</div><button class="sr-only" type="submit">搜索</button></form>`;
  };

  const previousCell = cell;
  cell = (item, column) => {
    if (column === 'comments') return item.comment_count ? `<span class="comment-count">${icon('comment')} ${item.comment_count}</span>` : '';
    if (column === 'changed') return `<span class="date">${esc(new Date(item.changed).toLocaleString('en-US').replace(', ', ' '))}</span>`;
    return previousCell(item, column);
  };
  table = function () {
    if (!state.items.length) return empty();
    const cols = columns();
    const sortable = (key, name) => `<button class="sort" data-sort="${key}">${name}${(state.filters.sort || 'changed') === key ? `<span class="sort-direction">${state.filters.dir === 'asc' ? '↑' : '↓'}</span>` : ''}</button>`;
    return `<div class="table-wrap"><table class="work-table"><thead><tr><th class="id-cell">${sortable('id', 'ID')}</th><th class="title-cell">${sortable('title', 'Title')}</th><th class="state-cell">${sortable('state', 'State')}</th>${cols.map(c => `<th class="col-${c}">${['type', 'priority', 'changed'].includes(c) ? sortable(c, allColumns[c]) : allColumns[c]}</th>`).join('')}<th class="col-spacer" aria-hidden="true"></th></tr></thead><tbody>${state.items.map(item => `<tr data-row="${item.id}" tabindex="0" aria-label="${item.id} ${esc(item.title)}"><td class="id-cell">${item.id}</td><td class="title-cell"><div class="row-title"><button class="item-title" data-open="${item.id}">${typeIcon(item.type)}<span>${esc(item.title)}</span></button>${button('row-actions', icon('more'), `data-id="${item.id}" title="More actions" aria-haspopup="menu" aria-expanded="false" aria-label="工作项 ${item.id} 更多操作"`, 'quiet row-more')}</div></td><td class="state-cell">${writable() && !item.deleted ? button('quick-edit-item', dot(item.state, item.type), `data-id="${item.id}" title="快速编辑状态、负责人和工时"`, 'quiet quick-field') : dot(item.state, item.type)}</td>${cols.map(c => `<td class="col-${c}">${cell(item, c)}</td>`).join('')}<td class="col-spacer" aria-hidden="true"></td></tr>`).join('')}</tbody></table></div>`;
  };

  const previousEnhance = MiniWorkItems.enhanceList;
  MiniWorkItems.enhanceList = function () {
    previousEnhance();
    const completed = $('.completed-toggle'), advanced = $('.advanced-filters');
    if (completed && advanced) advanced.append(completed);
    if (advanced && (state.filters.assignee_id || state.filters.iteration_id || state.filters.include_completed === 'true')) advanced.hidden = false;
    const bulk = $('#bulk-edit');
    if (bulk) { const menu = $('.command-options .overflow-menu > div'); if (menu) menu.append(bulk); bulk.hidden = true; }
    // Azure's list gives the first result keyboard focus and selection on load.
    const first = $('.work-table [data-select-item]');
    if (first && state.page === 'workitems') { first.checked = true; first.dispatchEvent(new Event('change', { bubbles: true })); }
  };

  const previousFooter = footer;
  footer = result => result.total <= result.items.length && result.offset === 0 ? '' : previousFooter(result);

  const previousOpen = openItem;
  openItem = async (...args) => {
    await previousOpen(...args);
    if (!dialog.open || !$('.editor-grid', dialog) || dialog.classList.contains('work-item-dialog')) return;
    dialog.classList.add('work-item-dialog');
    // This editor occupies the page content; project navigation must remain interactive.
    dialog.close();
    $('main', app).inert = true;
    dialog.show();
    dialog.dataset.itemType = typeClass($('[name="type"]', dialog).value);
    const modalContent = $('.modal-content', dialog), grid = $('.editor-grid', dialog), side = $('.editor-fields', dialog);
    const header = $('.modal-heading h2', dialog); header.classList.add('item-type-heading');
    const title = $('.editor-title', dialog);
    if (state.detail?.id) title.insertAdjacentHTML('afterbegin', `<span class="editor-id">${state.detail.id}</span>`);
    const bar = document.createElement('div'); bar.className = 'detail-commandbar';
    const owner = $('[name="assignee_id"]', dialog)?.closest('.field'); if (owner) { owner.classList.add('detail-owner'); bar.append(owner); }
    bar.append($('.item-actions', dialog));
    const save = $('.modal-footer button[type="submit"]', dialog);
    if (save) { save.innerHTML = icon('save') + ' Save & close'; bar.append(save); }
    title.after(bar);
    const tabs = $('.editor-tabs', dialog); grid.before(tabs);
    for (const [index, label] of ['Details', 'Discussion', 'History'].entries()) {
      const tab = $(`[data-editor-tab="${index}"]`, tabs), count = tab.querySelector('span');
      tab.textContent = label; if (count) tab.append(' ', count);
    }
    const meta = $('.ado-item-meta', dialog);
    const order = ['state', 'area', 'reason', 'iteration_id'];
    for (const name of order) meta.append($(`[name="${name}"]`, meta).closest('.field'));
    const stateSelect=$('[name="state"]',meta),stateWrap=document.createElement('div');stateWrap.className='state-control';stateSelect.before(stateWrap);stateWrap.innerHTML=dot(stateSelect.value,$('[name="type"]',dialog)?.value).split('</span>')[0]+'</span>';stateWrap.append(stateSelect);
    const reason=$('[name="reason"]',meta),reasonWrap=document.createElement('div');reasonWrap.className='reason-control';reason.before(reasonWrap);reasonWrap.innerHTML=icon(reason.disabled?'lock':'comment');reasonWrap.append(reason);reason.title=reason.disabled?'当前工作项为只读':'可填写本次状态变更的补充说明';
    const labels = { state: 'State', area: 'Area', iteration_id: 'Iteration', reason: 'Reason', assignee_id: 'Assigned To', description: 'Description', acceptance: 'Acceptance Criteria', type: 'Work Item Type', priority: 'Priority', estimate: 'Effort', tags: 'Tags', parent_id: 'Parent work item ID', comment: 'Discussion' };
    for (const [name, label] of Object.entries(labels)) {
      const control = $(`[name="${name}"]`, dialog), caption = control?.closest('.field')?.querySelector(':scope > span');
      if (caption) caption.textContent = label;
    }
    side.insertAdjacentHTML('afterbegin', '<h3 class="section-label detail-section-title">Details</h3>');
    const related = document.createElement('aside'); related.className = 'editor-related';
    const parent = $('[name="parent_id"]', dialog)?.closest('.field');
    if (parent) {
      const section = parent.previousElementSibling;
      if (section?.classList.contains('section-label')) { section.textContent = 'Related Work'; related.append(section); }
      let sibling = parent.nextElementSibling; related.append(parent);
      while (sibling) { const next = sibling.nextElementSibling; related.append(sibling); sibling = next; }
    }
    related.insertAdjacentHTML('beforeend', `<h3 class="section-label">Links & attachments</h3><div class="related-shortcuts"><button type="button" class="button quiet" data-editor-tab="3">${icon('query')} Links</button><button type="button" class="button quiet" data-editor-tab="4">${icon('folder')} Attachments</button></div>`);
    grid.append(related);
    const discussion = $('[data-editor-panel="1"]', dialog);
    if (discussion) {
      discussion.hidden = false;
      const composer = $('[name="comment"]', discussion)?.closest('.field'), send = $('[data-action="add-comment"]', discussion);
      if (composer && send) { discussion.prepend(composer); composer.after(send); }
    }
    const discussionLabel = $('[name="comment"]', dialog)?.closest('.field')?.querySelector(':scope > span');
    if (discussionLabel) discussionLabel.classList.add('discussion-label');
    const footer = $('.modal-footer', dialog); footer.classList.add('detail-footer');
    modalContent.classList.add('detail-content');
    // Moving controls preserves values, submit handling and the existing dirty-state snapshot.
    state.editorSnapshot = JSON.stringify([...new FormData($('#modal-form'))].filter(([key]) => key !== 'comment'));
  };

  const previousHandle = handle;
  handle = async (action, element) => {
    if (action === 'boards-navigation') { const root = $('.boards-navigation'); root.classList.toggle('open'); element.setAttribute('aria-expanded', root.classList.contains('open')); return; }
    if (action === 'dismiss-notice') { $('.azure-shell').classList.add('notice-dismissed'); savePref('reference-notice-dismissed', true); return; }
    if (action === 'new-item-type') { await openItem(undefined, { type: element.dataset.type }); return; }
    if (action === 'project-settings') { go('settings', {}); return; }
    if (action === 'show-help') { modal('Mini DevOps', '<p>Use the green Boards icon to open Work items, Boards, Backlogs, Sprints or Queries.</p><p>New Work Item creates a task or backlog item. Click a title to edit it; Column Options and the filter controls customize the list.</p>', async () => closeDialog(true), 'Close'); return; }
    if (action === 'toggle-navigation') { const shell = $('.azure-shell'); shell.classList.toggle('nav-expanded'); savePref('navigation-expanded', shell.classList.contains('nav-expanded')); element.setAttribute('aria-expanded', shell.classList.contains('nav-expanded')); return; }
    if (action === 'advanced-filters') { const section = $('.advanced-filters'); if (section) { $('#filters').hidden = false; section.hidden = !section.hidden; element.setAttribute('aria-expanded', !section.hidden); } return; }
    if (action === 'toggle-filters') { const filters = $('#filters'); if (filters) { filters.hidden = !filters.hidden; element.setAttribute('aria-expanded', !filters.hidden); } return; }
    if (action === 'focus-search') { const input=$('#global-search input');if(input.value.trim())input.form.requestSubmit();else input.focus();return; }
    if (action === 'full-screen') { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); return; }
    if (action === 'recycle-bin') { go('workitems', { view: 'recycle' }); return; }
    if (action === 'row-actions') {showRowMenu(element);return;}
    if (action === 'row-query') {element.dataset.ids=rowMenuItems.map(i=>i.id).join(';');closeRowMenu();return previousHandle('open-selected-query',element);}
    if (action === 'row-copy-selection') {
      const text=rowMenuItems.map(i=>`${i.id}\t${i.title}\t${location.origin}/#/workitems?project=${state.project}&item=${i.id}`).join('\n');
      await navigator.clipboard.writeText(text);closeRowMenu(true);toast('所选工作项已复制');return;
    }
    if (action === 'row-delete') {
      const items=[...rowMenuItems];closeRowMenu(true);if(!writable()||!confirm(`Delete ${items.length} work item(s)? You can restore them from the recycle bin.`))return;
      // Delete selected descendants before their selected parents. The server
      // still enforces versions, permissions and remaining child relationships.
      const depth=item=>{let n=0,current=item,seen=new Set();while(current.parent_id&&!seen.has(current.id)){seen.add(current.id);current=items.find(i=>i.id===current.parent_id);if(!current)break;n++;}return n;};
      items.sort((a,b)=>depth(b)-depth(a));let removed=0;
      try{for(const item of items){await api(`/items/${item.id}`,{method:'DELETE',body:{version:item.version}});removed++;}toast(`${removed} 个工作项已移入回收站`);}
      catch(error){toast(`${removed} 个已删除；${error.message}`);}
      await render();return;
    }
    await previousHandle(action, element);
    if (action === 'add-comment' && $('.discussion-item', dialog)) $('.discussion > p.muted', dialog)?.remove();
  };
  document.addEventListener('click', event => {
    const row = event.target.closest('tr[data-row]');
    if (row) { document.querySelectorAll('tr[data-row]').forEach(r => r.classList.toggle('selected-row', r === row)); }
    const tab = event.target.closest('[data-editor-tab]');
    if (tab && dialog.classList.contains('work-item-dialog') && tab.dataset.editorTab === '0') { const discussion = $('[data-editor-panel="1"]', dialog); if (discussion) discussion.hidden = false; }
    if (!event.target.closest('.overflow-menu')) document.querySelectorAll('.overflow-menu[open]').forEach(menu => menu.open = false);
    if (!event.target.closest('.boards-navigation')) { $('.boards-navigation')?.classList.remove('open'); $('[data-action="boards-navigation"]')?.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('change', event => {
    if (['state','type'].includes(event.target.name) && dialog.contains(event.target)) { const marker=$('.state-control .state-dot',dialog); if(marker)marker.outerHTML=dot($('[name="state"]',dialog).value,$('[name="type"]',dialog)?.value).split('</span>')[0]+'</span>'; }
    if (event.target.name === 'type' && dialog.contains(event.target)) dialog.dataset.itemType = typeClass(event.target.value);
    if (event.target.matches('[data-select-item],[data-select-all]')) {
      const bulk = $('#bulk-edit'); if (bulk) bulk.hidden = !document.querySelector('[data-select-item]:checked');
      document.querySelectorAll('tr[data-row]').forEach(row => row.classList.toggle('selected-row', !!row.querySelector('[data-select-item]:checked')));
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && dialog.open && dialog.classList.contains('work-item-dialog')) {
      event.preventDefault(); closeDialog(); return;
    }
    if (event.key === 'Enter' && event.target.matches('tr[data-row]')) { event.preventDefault(); openItem(Number(event.target.dataset.row)).catch(e => toast(e.message)); }
  });
  document.addEventListener('click', event => {
    if (!dialog.open || !dialog.classList.contains('work-item-dialog') || dialog.contains(event.target)) return;
    const control = event.target.closest('a[href^="#"],button[data-action]');
    if (!control || ['boards-navigation','toggle-navigation','dismiss-notice'].includes(control.dataset.action)) return;
    if (!closeDialog()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', event => {
    if(event.target.id!=='global-search')return;
    event.preventDefault();event.stopImmediatePropagation();
    if(dialog.open&&!closeDialog())return;
    const q=event.target.elements.search.value.trim().replace(/^#(?=\d+$)/,'');
    go('workitems',{view:'all',include_completed:'true',...(q?{q}:{})});
  },true);
  document.addEventListener('keydown',event=>{
    if(event.target.closest('#global-search')&&event.key==='Enter'&&(event.isComposing||event.keyCode===229))event.preventDefault();
  });
  document.addEventListener('pointerdown',event=>{if(rowMenu&&!rowMenu.contains(event.target)&&!rowMenuTrigger?.contains(event.target))closeRowMenu();});
  document.addEventListener('click',event=>{if(event.target.closest('#workitem-row-menu a'))setTimeout(()=>closeRowMenu(true),0);});
  document.addEventListener('focusin',event=>{if(rowMenu&&!rowMenu.contains(event.target)&&!rowMenuTrigger?.contains(event.target))closeRowMenu();});
  document.addEventListener('keydown',event=>{
    if(!rowMenu)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeRowMenu(true);return;}
    if(!rowMenu.contains(event.target))return;
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();const items=[...rowMenu.querySelectorAll('[role=menuitem]:not(:disabled)')],index=items.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();
    }
  },true);
  document.addEventListener('scroll',event=>{if(rowMenu&&!rowMenu.contains(event.target))closeRowMenu();},true);
  window.addEventListener('resize',()=>closeRowMenu());
  window.addEventListener('hashchange',()=>closeRowMenu());
  document.addEventListener('change', event => {
    if (event.target.name !== 'project' || dialog.contains(event.target) || !dialog.open) return;
    if (!closeDialog()) {
      event.target.value = String(state.project);
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  function cardTags(value) {
    const values=String(value||'').split(';').map(t=>t.trim()).filter(Boolean);
    return values.length?`<ul class="card-tags" aria-label="Tags">${values.map(t=>`<li><span class="card-tag" title="${esc(t)}">${esc(t)}</span></li>`).join('')}</ul>`:'';
  }
  return { icon, typeIcon, cardTags };
})();
