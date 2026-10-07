'use strict';
window.MiniWorkItems = (() => {
  let detailData, selected = new Set(), importRows = [], columnDraft, columnSelected;
  const clean = () => { if (state.dirty) throw Error('请先保存当前修改，再进行此操作。'); };
  function markdown(text) {
    const inline = raw => esc(raw).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    let code = false; return String(text || '').split('\n').map(line => { if (line.startsWith('```')) { code = !code; return code ? '<pre><code>' : '</code></pre>'; } if (code) return esc(line) + '\n'; if (/^#{1,3} /.test(line)) return `<h4>${inline(line.replace(/^#+ /, ''))}</h4>`; if (/^[-*] /.test(line)) return `<div class="md-list">• ${inline(line.slice(2))}</div>`; if (line.startsWith('> ')) return `<blockquote>${inline(line.slice(2))}</blockquote>`; return `<p>${inline(line) || '<br>'}</p>`; }).join('') + (code ? '</code></pre>' : '');
  }
  const oldOpen = openItem;
  openItem = async (id, defaults = {}) => {
    const opened = await oldOpen(id); if (!opened) return; const { item, result } = opened; detailData = result;
    const disabled = !writable() || item.deleted ? 'disabled' : '';
    if (!id) {
      const level = window.MiniBoards?.level(); const type = defaults.type || (['board', 'backlog'].includes(state.page) ? { backlog: 'Product Backlog Item', features: 'Feature', epics: 'Epic', tasks: 'Task', bugs: 'Bug' }[level] : 'Task');
      const team = window.MiniBoards?.selectedTeam(); const preset = { type, state: state.meta.types[type][0], area: team ? JSON.parse(team.areas)[0] || state.meta.project.name : state.meta.project.name, ...defaults };
      const typeSelect = $('[name="type"]', dialog); typeSelect.value = preset.type; typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      for (const [key, value] of Object.entries(preset)) { const field = $(`[name="${key}"]`, dialog); if (field) field.value = value ?? ''; } Object.assign(item, preset);
    }
    const side = $('.editor-fields', dialog);
    side.insertAdjacentHTML('beforeend', `<h3 class="section-label">Planning</h3>${field('Remaining Work (h)', input('remaining_work', item.remaining_work || 0, `type="number" min="0" max="100000" step="0.25" ${disabled}`))}${field('Original Estimate (h)', input('original_estimate', item.original_estimate || 0, `type="number" min="0" max="100000" step="0.25" ${disabled}`))}${field('Completed Work (h)', input('completed_work', item.completed_work || 0, `type="number" min="0" max="100000" step="0.25" ${disabled}`))}${field('Activity', select('activity', ['', 'Development', 'Design', 'Testing', 'Documentation', 'Requirements', 'Deployment'].map(v => option(v, v || '未设置', item.activity)).join(''), disabled))}${field('Target Date', input('target_date', item.target_date || '', `type="date" ${disabled}`))}${field('Blocked', select('blocked', option(0, 'No', item.blocked || 0) + option(1, 'Yes', item.blocked), disabled))}${field('Severity', select('severity', [1, 2, 3, 4].map(n => option(n, `${n} - ${['Critical', 'High', 'Medium', 'Low'][n - 1]}`, item.severity || 3)).join(''), disabled))}`);
    const headerFields = document.createElement('div'); headerFields.className = 'ado-item-meta';
    for (const name of ['state', 'area', 'iteration_id']) headerFields.append($(`[name="${name}"]`, dialog).closest('.field'));
    headerFields.insertAdjacentHTML('beforeend', field('Reason', input('reason', item.reason || '', `maxlength="200" placeholder="状态更改原因（选填）" ${disabled}`)));
    $('.editor-grid', dialog).before(headerFields);
    $('[data-editor-panel="0"]', dialog).insertAdjacentHTML('afterbegin', `<div class="bug-fields" ${item.type !== 'Bug' ? 'hidden' : ''}>${field('Repro Steps · 重现步骤', `<textarea name="repro_steps" rows="4" maxlength="20000" ${disabled}>${esc(item.repro_steps || '')}</textarea>`)}${field('System Info', `<textarea name="system_info" rows="2" maxlength="4000" ${disabled}>${esc(item.system_info || '')}</textarea>`)}</div>`);
    $('.editor-tabs', dialog).insertAdjacentHTML('beforeend', `<button type="button" role="tab" aria-selected="false" data-editor-tab="3">Links <span>${result?.links.length || 0}</span></button><button type="button" role="tab" aria-selected="false" data-editor-tab="4">Attachments <span>${result?.attachments.length || 0}</span></button>`);
    $('.editor-main', dialog).insertAdjacentHTML('beforeend', `<section data-editor-panel="3" hidden>${id && !disabled ? button('add-link', '＋ Add link') + button('add-child', '＋ New linked work item', `data-id="${id}"`) : ''}<div class="item-links">${renderLinks(result?.links || [], id)}</div></section><section data-editor-panel="4" hidden>${id && !disabled ? `<label class="attachment-upload">＋ Add attachment<input type="file" id="attachment-file" aria-label="上传附件"></label><p class="hint">单文件最多 2 MB，最多 20 个文件，总计 20 MB。</p>` : '<p class="hint">保存工作项后可上传附件。</p>'}<div class="attachment-list">${result?.attachments.map(a => `<div><span>▧</span><a href="/api/items/${id}/attachments/${a.id}" download>${esc(a.name)}</a><small>${Math.ceil(a.size / 1024)} KB · ${esc(a.user_name)} · ${date(a.created)}</small>${!disabled ? button('delete-attachment', '×', `data-id="${a.id}" aria-label="删除附件"`, 'quiet danger') : ''}</div>`).join('') || '<p class="muted">暂无附件</p>'}</div></section>`);
    for (const name of ['description', 'acceptance', 'comment', 'repro_steps']) {
      const textarea = $(`textarea[name="${name}"]`, dialog); if (!textarea) continue;
      textarea.before(Object.assign(document.createElement('div'), { className: 'markdown-toolbar', innerHTML: `${!disabled ? button('markdown-bold', 'B', `data-name="${name}" title="加粗"`, 'quiet') + button('markdown-code', '&lt;/&gt;', `data-name="${name}" title="代码"`, 'quiet') : ''}${button('markdown-preview', 'Preview', `data-name="${name}"`, 'quiet')}<span>Markdown</span>` }));
      textarea.after(Object.assign(document.createElement('div'), { className: 'markdown-preview', hidden: true, id: 'preview-' + name }));
    }
    for (const [index, comment] of (result?.comments || []).entries()) {
      const article = dialog.querySelectorAll('.discussion-item')[index]; $('p', article).innerHTML = markdown(comment.body);
      if (comment.user_id === state.user.id && !disabled) $('div', article).insertAdjacentHTML('beforeend', button('edit-comment', '编辑', `data-id="${comment.id}"`, 'quiet') + (comment.edits.length ? `<details><summary>编辑历史 (${comment.edits.length})</summary>${comment.edits.map(e => `<div class="comment-revision"><time>${date(e.changed)}</time><pre>${esc(e.body)}</pre></div>`).join('')}</details>` : ''));
    }
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.innerHTML = id ? `${button('follow-item', result.following ? '★ Following' : '☆ Follow', '', 'quiet')}${button('copy-item-link', 'Copy link', `data-id="${id}"`, 'quiet')}${!disabled ? button('clone-item', 'Create copy', `data-id="${id}"`, 'quiet') + button('add-child', '＋ 子工作项', `data-id="${id}"`, 'quiet') : ''}` : '';
    $('.editor-meta', dialog).after(actions);
    state.dirty = false; state.editorSnapshot = JSON.stringify([...new FormData($('#modal-form'))].filter(([key]) => key !== 'comment'));
    if (id) await api(`/items/${id}/visit`, { method: 'POST', body: {} });
  };
  function renderLinks(links, id) {
    return links.map(link => { const source = link.source_id === id; const targetId = source ? link.target_id : link.source_id; const title = source ? link.target_title : link.source_title; const kind = link.kind === 'dependency' ? source ? 'Successor' : 'Predecessor' : link.kind === 'duplicate' ? source ? 'Duplicate of' : 'Duplicated by' : link.kind === 'hyperlink' ? 'Hyperlink' : 'Related';
      return `<div class="item-link"><span class="role-badge">${kind}</span>${link.kind === 'hyperlink' ? `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label || link.url)}</a>` : button('open-related', `#${targetId} ${esc(title)}`, `data-id="${targetId}"`, 'quiet')}${writable() && !state.detail.deleted ? button('delete-link', '×', `data-id="${link.id}" aria-label="移除关联"`, 'quiet danger') : ''}</div>`;
    }).join('') || '<p class="muted">暂无其他关联。父子关系可在详细信息中设置。</p>';
  }
  function enhanceList() {
    selected.clear(); if (!['workitems', 'queries'].includes(state.page)) return;
    const command = $('.commands'); if (command && !$('#bulk-edit')) command.insertAdjacentHTML('beforeend', `${writable() ? button('bulk-edit', '批量编辑', 'id="bulk-edit" disabled', 'quiet') : ''}`);
    if (command && writable() && !$('[data-action="import-items"]')) command.insertAdjacentHTML('beforeend', button('import-items', '↑ Import Work Items', '', 'quiet'));
    if (command && !$('[data-action="open-query-editor"]')) command.insertAdjacentHTML('beforeend', button('open-query-editor', 'Open in Queries', '', 'quiet'));
    const table = $('.work-table'); if (!table || !writable()) return;
    $('thead tr', table).insertAdjacentHTML('afterbegin', '<th class="selection-cell"><input type="checkbox" data-select-all aria-label="选择本页工作项"></th>');
    for (const row of table.querySelectorAll('tbody tr[data-row]')) row.insertAdjacentHTML('afterbegin', `<td class="selection-cell"><input type="checkbox" data-select-item="${row.dataset.row}" aria-label="选择工作项 ${row.dataset.row}"></td>`);
    const filter = $('#filters'); if (filter && !$('#include-completed')) filter.insertAdjacentHTML('afterend', `<label class="check completed-toggle"><input type="checkbox" id="include-completed" ${state.filters.include_completed === 'true' ? 'checked' : ''}> 显示已完成和 Removed 工作项</label>`);
  }
  Object.assign(allColumns, { iteration: '迭代', remaining: 'Remaining Work', target: 'Target Date' });
  const oldCell = cell; cell = (item, key) => key === 'iteration' ? esc(state.meta.iterations.find(i => i.id === item.iteration_id)?.name || '—') : key === 'remaining' ? `${item.remaining_work} h` : key === 'target' ? esc(item.target_date || '—') : oldCell(item, key);
  columns = () => { const saved = pref('columns', ['area', 'tags', 'comments', 'changed']); return Array.isArray(saved) ? [...new Set(saved)].filter(c => allColumns[c]) : Object.keys(allColumns); };
  function columnDialog() {
    modal('Column options', '<p class="hint">勾选显示字段，使用箭头调整顺序。ID、标题和状态始终显示。</p><div class="ordered-columns">' + columnDraft.map((c, index) => `<div><label class="check"><input type="checkbox" name="column" value="${c}" ${columnSelected.includes(c) ? 'checked' : ''}>${allColumns[c]}</label>${button('column-up', '↑', `data-index="${index}"`, 'quiet')}${button('column-down', '↓', `data-index="${index}"`, 'quiet')}</div>`).join('') + '</div>', async form => { savePref('columns', new FormData(form).getAll('column')); closeDialog(true); await render(); });
  }
  const csvFields = { ID: 'id', Version: 'version', 'Work Item Type': 'type', Title: 'title', State: 'state', 'Assigned To': 'assignee_id', Priority: 'priority', 'Area Path': 'area', Tags: 'tags', 'Iteration ID': 'iteration_id', 'Parent ID': 'parent_id', Effort: 'estimate', 'Remaining Work': 'remaining_work', 'Original Estimate': 'original_estimate', 'Completed Work': 'completed_work', Description: 'description', 'Acceptance Criteria': 'acceptance' };
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, ''); const rows = []; let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else if (quoted) quoted = false; else if (value === '') quoted = true; else throw Error('CSV 引号格式无效'); } else if (c === ',' && !quoted) { row.push(value); value = ''; } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ''; } else value += c; }
    if (quoted) throw Error('CSV 存在未闭合的引号'); row.push(value); if (row.some(Boolean)) rows.push(row);
    if (rows.length < 2 || rows.length > 201) throw Error('CSV 需要表头和 1–200 行数据');
    const header = rows.shift().map(s => s.trim()); if (new Set(header).size !== header.length) throw Error('CSV 表头不能重复');
    const aliases = { 编号: 'id', 标题: 'title', 类型: 'type', 状态: 'state', 负责人: 'assignee_id', 优先级: 'priority', 标签: 'tags', 版本: 'version', ...csvFields };
    if (!header.includes('Title') && !header.includes('标题')) throw Error('CSV 必须包含 Title 列');
    return rows.map((values, index) => {
      if (values.length !== header.length) throw Error(`第 ${index + 2} 行列数与表头不一致`); const data = {};
      header.forEach((name, col) => { const key = aliases[name]; if (!key) return; let value = values[col]; if (['id', 'version', 'assignee_id', 'priority', 'iteration_id', 'parent_id', 'estimate', 'remaining_work', 'original_estimate', 'completed_work'].includes(key)) {
        if (key === 'assignee_id' && value && !/^\d+$/.test(value)) { const person = state.meta.members.find(m => m.login === value || m.name === value); if (!person) throw Error(`第 ${index + 2} 行负责人不属于项目`); value = String(person.id); }
        if (!value) { if (['assignee_id', 'iteration_id', 'parent_id'].includes(key)) data[key] = null; return; }
        if (!Number.isFinite(Number(value))) throw Error(`第 ${index + 2} 行 ${name} 必须为数字`); data[key] = Number(value);
      } else data[key] = value; });
      if (!data.id && !data.type) throw Error(`第 ${index + 2} 行新工作项需要 Work Item Type`); if (data.id && !data.version) throw Error(`第 ${index + 2} 行更新现有工作项需要 Version，以避免覆盖新修改`); return data;
    });
  }
  function exportCsv() {
    const quote = value => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
    const rows = [Object.keys(csvFields), ...state.items.map(item => Object.values(csvFields).map(key => item[key]))]; const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `work-items-${state.project}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`已导出当前页 ${state.items.length} 个工作项`);
  }
  const oldHandle = handle;
  handle = async (action, element) => {
    const id = Number(element.dataset.id);
    if (action === 'columns') { columnSelected = columns(); columnDraft = [...columns(), ...Object.keys(allColumns).filter(c => !columns().includes(c))]; return columnDialog(); }
    if (action === 'column-up' || action === 'column-down') { columnSelected = new FormData($('#modal-form')).getAll('column'); const i = Number(element.dataset.index), j = i + (action === 'column-up' ? -1 : 1); if (j >= 0 && j < columnDraft.length) [columnDraft[i], columnDraft[j]] = [columnDraft[j], columnDraft[i]]; return columnDialog(); }
    if (action === 'export') return exportCsv();
    if (action === 'copy-item-link') { const itemId = id || state.detail.id; await navigator.clipboard.writeText(`${location.origin}/#/workitems?project=${state.project}&item=${itemId}`); toast('链接已复制'); return; }
    if (action === 'follow-item') { const value = !detailData.following; await api(`/items/${state.detail.id}/follow`, { method: 'POST', body: { following: Number(value) } }); detailData.following = value; element.textContent = value ? '★ Following' : '☆ Follow'; return; }
    if (action === 'add-child') return openItem(undefined, { parent_id: id, type: 'Task', state: 'To Do', iteration_id: state.page === 'sprints' ? Number(state.filters.iteration_id) : state.detail?.iteration_id || null });
    if (action === 'clone-item') {
      if (dialog.open) clean(); const original = state.detail?.id === id ? state.detail : (await api(`/items/${id}`)).item;
      return modal('Create copy of work item', field('标题', input('title', 'Copy of ' + original.title, 'required maxlength="300"')) + field('类型', select('type', Object.keys(state.meta.types).map(t => option(t, t, original.type)).join(''))) + '<p class="hint">复制字段并关联原工作项；评论、历史和附件保留在原工作项。</p>', async form => { const saved = await api(`/items/${id}/clone`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); closeDialog(true); await render(); await openItem(saved.id); }, '创建副本');
    }
    if (action.startsWith('markdown-')) {
      const name = element.dataset.name; const textarea = $(`[name="${name}"]`, dialog); const preview = $(`#preview-${name}`, dialog);
      if (action === 'markdown-preview') { preview.hidden = !preview.hidden; textarea.hidden = !preview.hidden; preview.innerHTML = markdown(textarea.value); element.textContent = preview.hidden ? 'Preview' : 'Edit'; }
      else { const wrap = action === 'markdown-bold' ? '**' : '`'; const start = textarea.selectionStart, end = textarea.selectionEnd; textarea.setRangeText(wrap + (textarea.value.slice(start, end) || '文本') + wrap, start, end, 'select'); textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.focus(); } return;
    }
    if (action === 'add-link') {
      clean(); const item = state.detail;
      return modal('Add link', field('关联类型', select('kind', [['related', 'Related'], ['predecessor', 'Predecessor'], ['successor', 'Successor'], ['duplicate', 'Duplicate of'], ['hyperlink', 'Hyperlink']].map(([v, n]) => option(v, n, 'related')).join(''))) + field('目标工作项 ID（Hyperlink 时留空）', input('target_id', '', 'type="number" min="1"')) + field('URL（仅 Hyperlink）', input('url', '', 'type="url" maxlength="2000"')) + field('说明（可选）', input('label', '', 'maxlength="200"')), async form => { const data = Object.fromEntries(new FormData(form)); data.target_id = Number(data.target_id) || null; data.version = item.version; await api(`/items/${item.id}/links`, { method: 'POST', body: data }); closeDialog(true); await openItem(item.id); $('[data-editor-tab="3"]', dialog).click(); });
    }
    if (action === 'delete-link' || action === 'delete-attachment') { clean(); const item = state.detail; if (!confirm(action === 'delete-link' ? '移除此关联？' : '删除此附件？')) return; await api(`/items/${item.id}/${action === 'delete-link' ? 'links' : 'attachments'}/${id}`, { method: 'DELETE', body: { version: item.version } }); closeDialog(true); await openItem(item.id); $(`[data-editor-tab="${action === 'delete-link' ? 3 : 4}"]`, dialog).click(); return; }
    if (action === 'edit-comment') {
      clean(); const itemId = state.detail.id; const comment = detailData.comments.find(c => c.id === id);
      return modal('编辑评论', field('内容', `<textarea name="body" rows="8" required maxlength="10000">${esc(comment.body)}</textarea>`), async form => { await api(`/items/${itemId}/comments/${id}`, { method: 'PATCH', body: { body: form.elements.body.value, version: comment.version } }); closeDialog(true); await openItem(itemId); $('[data-editor-tab="1"]', dialog).click(); });
    }
    if (action === 'bulk-edit') {
      const items = state.items.filter(i => selected.has(i.id)); if (!items.length) return;
      return modal(`批量编辑 ${items.length} 个工作项`, field('字段', select('bulk_field', [['state', '状态'], ['assignee_id', '负责人 ID'], ['iteration_id', '迭代 ID'], ['priority', '优先级'], ['tags', '标签（覆盖）'], ['area', 'Area Path']].map(([v, n]) => option(v, n, 'state')).join(''))) + field('值', input('value', '', 'maxlength="1000" placeholder="负责人和迭代留空表示清空"')) + '<p class="hint">不同类型须支持所选状态。任一项已更新或校验失败，本次批量编辑全部取消。</p>', async form => { const key = form.elements.bulk_field.value; let value = form.elements.value.value; if (['assignee_id', 'iteration_id', 'priority'].includes(key)) value = value ? Number(value) : null; await api(`/projects/${state.project}/bulk`, { method: 'POST', body: { items: items.map(i => ({ id: i.id, version: i.version })), changes: { [key]: value } } }); closeDialog(true); toast('批量修改已保存'); await render(); });
    }
    if (action === 'import-items') {
      importRows = [];
      modal('Import Work Items', '<p class="hint">支持带表头的 UTF-8 CSV。新建需要 Work Item Type、Title；更新需要 ID、Version。可以先导出当前页作为模板。</p><input type="file" accept=".csv,text/csv" id="csv-file" aria-label="选择 CSV"><div id="import-preview"><p class="muted">选择文件后先预览，再确认导入。</p></div>', async () => { if (!importRows.length) throw Error('请先选择有效 CSV'); const result = await api(`/projects/${state.project}/import`, { method: 'POST', body: { items: importRows } }); closeDialog(true); toast(`已导入 ${result.count} 个工作项`); await render(); }, '确认导入', true); $('button[type="submit"]', dialog).disabled = true; return;
    }
    return oldHandle(action, element);
  };
  document.addEventListener('change', async event => {
    const el = event.target;
    if (el.name === 'type' && dialog.contains(el) && $('.bug-fields', dialog)) $('.bug-fields', dialog).hidden = el.value !== 'Bug';
    if (el.hasAttribute('data-select-item')) { const id = Number(el.dataset.selectItem); el.checked ? selected.add(id) : selected.delete(id); $('#bulk-edit').disabled = selected.size === 0; }
    if (el.hasAttribute('data-select-all')) { for (const box of document.querySelectorAll('[data-select-item]')) { box.checked = el.checked; const id = Number(box.dataset.selectItem); el.checked ? selected.add(id) : selected.delete(id); } $('#bulk-edit').disabled = selected.size === 0; }
    if (el.id === 'include-completed') go(state.page, { ...state.filters, include_completed: String(el.checked), offset: '0' });
    if (el.id === 'csv-file') {
      try { const file = el.files[0]; if (!file) return; if (file.size > 3 * 1048576) throw Error('CSV 不能超过 3 MB'); importRows = parseCsv(await file.text()); $('#import-preview').innerHTML = `<p>${importRows.filter(r => !r.id).length} 项新建，${importRows.filter(r => r.id).length} 项更新</p><div class="table-wrap"><table class="work-table"><thead><tr><th>ID</th><th>类型</th><th>标题</th><th>状态</th></tr></thead><tbody>${importRows.slice(0,10).map(r => `<tr><td>${r.id || '新建'}</td><td>${esc(r.type || '保留')}</td><td>${esc(r.title)}</td><td>${esc(r.state || '默认')}</td></tr>`).join('')}</tbody></table></div>`; $('button[type="submit"]', dialog).disabled = false; $('.form-error', dialog).textContent = ''; }
      catch (error) { importRows = []; $('.form-error', dialog).textContent = error.message; $('button[type="submit"]', dialog).disabled = true; }
    }
    if (el.id === 'attachment-file') {
      try { clean(); const file = el.files[0]; if (!file) return; if (file.size > 2097152) throw Error('附件不能超过 2 MB'); const itemId = state.detail.id; const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); await api(`/items/${itemId}/attachments`, { method: 'POST', body: { name: file.name, content } }); closeDialog(true); await openItem(itemId); $('[data-editor-tab="4"]', dialog).click(); toast('附件已上传'); }
      catch (error) { const target = $('.form-error', dialog); if (target) target.textContent = error.message; else toast(error.message); }
    }
  });
  return { enhanceList, markdown, parseCsv, detailData: () => detailData };
})();
