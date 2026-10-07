'use strict';
// Keep the existing editor fields and handlers; arrange them in Azure's page layout.
window.DetailUI = (() => {
  const { icon, typeIcon } = AzureUI;
  const make = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });
  const cmd = (action, glyph, label, extra = '') => button(action, icon(glyph) + `<span>${label}</span>`, extra, 'quiet');
  const initials = name => String(name || '?').trim().split(/\s+/).map(s => Array.from(s)[0]).slice(0, 2).join('').toUpperCase();
  const face = name => `<span class="detail-avatar" title="${esc(name || '未分配')}">${esc(initials(name))}</span>`;

  function syncOwner() {
    const owner = $('[name="assignee_id"]', dialog), target = $('.detail-owner-avatar', dialog);
    if (owner && target) target.innerHTML = face(state.meta.members.find(m => String(m.id) === owner.value)?.name);
  }
  function syncFollow() {
    const follow = $('[data-action="follow-item"]', dialog);
    if (follow) follow.innerHTML = icon('follow') + `<span>${MiniWorkItems.detailData()?.following ? 'Following' : 'Follow'}</span>`;
  }
  function syncTags() {
    const source = $('[name="tags"]', dialog), list = $('.detail-tag-list', dialog);
    if (!source || !list) return;
    const editable = writable() && !state.detail.deleted;
    list.innerHTML = source.value.split(';').map(t => t.trim()).filter(Boolean).map(t => `<span class="detail-tag" title="${esc(t)}"><span>${esc(t)}</span>${editable ? button('detail-remove-tag', icon('close'), `data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}"`, 'quiet') : ''}</span>`).join('');
    list.hidden = !list.children.length;
  }
  function syncControls() {
    if (!dialog.open || !dialog.classList.contains('detail-layout')) return;
    const form = $('#modal-form');
    const changed = !state.detail?.id || JSON.stringify([...new FormData(form)].filter(([key]) => key !== 'comment')) !== state.editorSnapshot;
    for (const control of form.querySelectorAll('.detail-save,button[type="submit"]')) control.disabled = form.dataset.saving === 'true' || !changed;
    const revert = $('[data-action="detail-revert"]', form);
    if (revert) revert.disabled = form.dataset.saving === 'true' || !(changed && state.detail?.id || state.dirty);
  }
  function arrangeMenu(menu, saveClose) {
    const list = $(':scope > div', menu), summary = $('summary', menu);
    list.setAttribute('role', 'menu'); list.setAttribute('aria-label', 'Work item actions');
    summary.setAttribute('aria-haspopup', 'menu'); summary.setAttribute('aria-expanded', 'false');
    const existing = action => $(`[data-action="${action}"]`, list);
    const row = (element, glyph, label) => {
      if (!element) return;
      element.className = 'button quiet detail-menu-item';
      element.innerHTML = icon(glyph) + `<span>${label}</span>`;
      element.setAttribute('role', 'menuitem'); list.append(element);
    };
    const add = (action, glyph, label) => {
      const element = make('button', ''); element.type = 'button'; element.dataset.action = action;
      row(element, glyph, label);
    };
    if (writable() && !state.detail.deleted) add('detail-revert', 'undo', 'Revert Changes');
    row(existing('add-child'), 'linkedItem', 'New linked work item');
    if (writable() && !state.detail.deleted) add('detail-change-type', 'changeType', 'Change type...');
    row(existing('clone-item'), 'copy', 'Create copy of work item...');
    row(existing('delete-item'), 'trash', 'Delete');
    row(existing('restore-item'), 'undo', 'Restore work item');
    row(existing('copy-item-link'), 'link', 'Copy link');
    if (saveClose && !saveClose.hidden) {
      const separator = make('div', 'detail-menu-separator'); separator.setAttribute('role', 'separator'); list.append(separator);
      row(saveClose, 'save', 'Save & close');
    }
    const enabled = () => [...list.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    menu.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(menu.open));
      if (menu.open) enabled()[0]?.focus({ preventScroll: true });
    });
    menu.addEventListener('click', event => { if (event.target.closest('[role="menuitem"]:not(:disabled)')) menu.open = false; });
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus(); return;
      }
      if (event.key === 'Tab') { menu.open = false; return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (!menu.open) { menu.open = true; return; }
      const items = enabled(), index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    });
  }
  function relation(item) {
    const record = item;
    const owner = record.assignee_name || state.meta.members.find(m => m.id === record.assignee_id)?.name;
    return `<div class="detail-relation"><div class="detail-relation-title">${typeIcon(item.type)}${owner ? face(owner) : ''}<span class="related-id">${item.id}</span>${button('open-related', esc(item.title), `data-id="${item.id}" title="${esc(item.title)}"`, 'quiet')}</div><div class="detail-relation-meta">${record.changed ? `<span>Updated ${esc(new Date(record.changed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>` : ''}${dot(item.state, item.type)}</div></div>`;
  }
  const oldOpen = openItem;
  openItem = async (...args) => {
    await oldOpen(...args);
    if (!dialog.open || !dialog.classList.contains('work-item-dialog') || dialog.classList.contains('detail-layout')) return;
    dialog.classList.add('detail-layout');
    const data = MiniWorkItems.detailData(), form = $('#modal-form'), content = $('.detail-content', dialog);
    const heading = $('.modal-heading', dialog), title = $('.editor-title', dialog), bar = $('.detail-commandbar', dialog);
    const header = make('header', 'detail-header');
    form.prepend(header); header.append(heading, title, bar);
    const close = $('.close-button', heading);
    close.innerHTML = icon('close'); close.title = 'Close work item'; close.setAttribute('aria-label', 'Close work item');
    const owner = $('.detail-owner', bar);
    owner.before(make('span', 'detail-owner-avatar')); syncOwner();
    const shortcuts = make('div', 'detail-header-shortcuts');
    const count = data?.comments.length || 0;
    shortcuts.innerHTML = `${cmd('detail-discussion', 'comment', `${count} ${count === 1 ? 'Comment' : 'Comments'}`)}<div class="detail-tags-group"><div class="detail-tag-list" aria-label="Tags"></div>${writable() && !state.detail.deleted ? button('detail-tags', 'Add Tag', 'aria-expanded="false"', 'quiet') : ''}</div>`;
    owner.after(shortcuts);
    const actions = $('.item-actions', bar), saveClose = $('button[type="submit"]', bar);
    const menu = make('details', 'overflow-menu detail-more', `<summary aria-label="More work item actions" title="More actions">${icon('verticalMore')}</summary><div></div>`);
    const menuItems = $('div', menu);
    if (saveClose && !saveClose.hidden) {
      bar.append(make('button', 'button primary detail-save', icon('save') + '<span>Save</span>'));
      const save = $('.detail-save', bar); save.type = 'button'; save.dataset.action = 'detail-save';
      saveClose.addEventListener('click', () => { form.dataset.saveMode = 'close'; });
      menuItems.append(saveClose);
    }
    if (actions) {
      const follow = $('[data-action="follow-item"]', actions); if (follow) bar.append(follow);
      menuItems.append(...actions.children); actions.remove(); syncFollow();
    }
    const footer = $('.detail-footer', dialog);
    for (const action of footer.querySelectorAll('[data-action="delete-item"],[data-action="restore-item"]')) menuItems.append(action);
    if (state.detail.id) bar.append(make('button', 'button quiet detail-refresh', icon('refresh')));
    const refresh = $('.detail-refresh', bar);
    if (refresh) { refresh.type = 'button'; refresh.dataset.action = 'detail-refresh'; refresh.title = 'Refresh work item'; refresh.setAttribute('aria-label', 'Refresh work item'); }
    if (menuItems.children.length) bar.append(menu);
    arrangeMenu(menu, saveClose);
    heading.append(close); footer.hidden = true;

    const meta = $('.ado-item-meta', dialog), updated = $('.editor-meta', dialog), tabs = $('.editor-tabs', dialog);
    const properties = make('div', 'detail-properties'); content.prepend(properties); properties.append(meta, updated, tabs);
    if (data) {
      updated.textContent = `Updated ${date(state.detail.changed)} · Version ${state.detail.version}`;
      updated.title = `Created by ${state.detail.creator_name} · ${date(state.detail.created)}`;
    }
    const grid = $('.editor-grid', dialog), scroll = make('div', 'detail-scroll');
    grid.before(scroll); scroll.append(grid);
    const related = $('.editor-related', grid), parent = $('[name="parent_id"]', related)?.closest('.field');
    const existingRows = [...related.querySelectorAll('.link-row')]; existingRows.forEach(row => row.remove());
    const relatedTitle = $('.section-label', related);
    const relations = make('div', 'detail-relations');
    relations.innerHTML = `${data?.parent ? `<h4>Parent</h4>${relation(data.parent)}` : ''}${data?.children.length ? `<h4>Child</h4>${data.children.map(relation).join('')}` : ''}`;
    if (!relations.innerHTML) relations.innerHTML = '<p class="muted">暂无父子工作项</p>';
    relatedTitle.after(relations);
    if (parent) {
      const picker = $('.parent-picker', related);
      const edit = make('details', 'detail-parent-edit', '<summary>修改父工作项</summary>');
      // New items keep the picker visible so a parent can be set immediately.
      edit.open = !state.detail.id;
      relations.after(edit); if (picker) edit.append(picker); edit.append(parent);
    }
    const discussion = $('[data-editor-panel="1"]', dialog);
    discussion.prepend(make('h3', 'section-label', 'Discussion'));
    const composer = $('[name="comment"]', discussion)?.closest('.field'), send = $('[data-action="add-comment"]', discussion);
    if (composer && send) {
      const card = make('div', 'detail-comment-composer', face(state.user.name));
      const editor = make('div', 'detail-comment-editor');
      composer.before(card); card.append(editor); editor.append(composer);
      $(':scope > span', composer).classList.add('sr-only');
      const toolbar = $('.markdown-toolbar', composer); composer.append(toolbar);
      const bottom = make('div', 'detail-comment-bottom', '<span>Markdown supported</span>'); bottom.append(send); editor.append(bottom);
      $('[name="comment"]', composer).placeholder = 'Add a comment. 分享进展或提出问题…';
    }
    const tags = $('[name="tags"]', dialog); tags.closest('.field').nextElementSibling?.classList.contains('hint') && tags.closest('.field').nextElementSibling.remove();
    const tagEditor = tags.closest('.field');
    tagEditor.classList.add('detail-tag-editor'); tagEditor.hidden = true;
    $('.detail-tags-group', dialog).append(tagEditor); syncTags();
    state.editorSnapshot = JSON.stringify([...new FormData(form)].filter(([key]) => key !== 'comment'));
    const submit = dialog.onSubmit;
    dialog.onSubmit = async activeForm => {
      if (activeForm.dataset.saving === 'true') return;
      activeForm.dataset.saving = 'true'; syncControls();
      try { await submit(activeForm); }
      finally { delete activeForm.dataset.saving; delete activeForm.dataset.saveMode; syncControls(); }
    };
    syncControls();
  };

  const oldHandle = handle;
  handle = async (action, element) => {
    if (action === 'detail-save') {
      const form = $('#modal-form');
      if (!form.reportValidity()) return;
      form.dataset.saveMode = 'stay';
      element.disabled = true;
      try { await dialog.onSubmit(form); } finally { element.disabled = false; }
      return;
    }
    if (action === 'detail-refresh') { await openItem(state.detail.id); return; }
    if (action === 'detail-revert') { await openItem(state.detail.id || undefined); return; }
    if (action === 'detail-change-type') {
      $('[data-editor-tab="0"]', dialog).click();
      const field = $('[name="type"]', dialog); field.scrollIntoView({ block: 'center' }); field.focus(); return;
    }
    if (action === 'detail-discussion') {
      $('[data-editor-tab="0"]', dialog).click(); $('[data-editor-panel="1"]', dialog).scrollIntoView({ block: 'start', behavior: 'smooth' }); $('[name="comment"]', dialog)?.focus({ preventScroll: true }); return;
    }
    if (action === 'detail-tags') {
      const tags = $('[name="tags"]', dialog), editor = tags.closest('.detail-tag-editor');
      editor.hidden = !editor.hidden; element.setAttribute('aria-expanded', String(!editor.hidden));
      if (!editor.hidden) { tags.focus(); tags.setSelectionRange(tags.value.length, tags.value.length); } return;
    }
    if (action === 'detail-remove-tag') {
      if (!writable() || state.detail.deleted) return;
      const source = $('[name="tags"]', dialog);
      source.value = source.value.split(';').map(t => t.trim()).filter(t => t && t !== element.dataset.tag).join('; ');
      source.dispatchEvent(new Event('input', { bubbles: true }));
      $('[data-action="detail-tags"]', dialog)?.focus(); return;
    }
    await oldHandle(action, element);
    if (action === 'follow-item') syncFollow();
    if (action === 'add-comment' && dialog.classList.contains('detail-layout')) {
      const count = Number($('[data-editor-tab="1"] span', dialog).textContent);
      $('[data-action="detail-discussion"] span', dialog).textContent = `${count} ${count === 1 ? 'Comment' : 'Comments'}`;
    }
  };
  document.addEventListener('change', event => { if (event.target.name === 'assignee_id' && dialog.classList.contains('detail-layout')) syncOwner(); syncControls(); });
  document.addEventListener('input', event => { if (dialog.contains(event.target)) { if (event.target.name === 'tags') syncTags(); syncControls(); } });
  function closeTagEditor() {
    const editor = $('.detail-tag-editor', dialog); if (!editor || editor.hidden) return false;
    editor.hidden = true; $('[data-action="detail-tags"]', dialog)?.setAttribute('aria-expanded', 'false'); return true;
  }
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.detail-tags-group')) closeTagEditor(); });
  dialog.addEventListener('keydown', event => {
    if (event.target.name === 'tags' && ['Enter', 'Escape'].includes(event.key) && closeTagEditor()) {
      event.preventDefault(); event.stopImmediatePropagation(); $('[data-action="detail-tags"]', dialog)?.focus();
    }
  }, true);
  return { syncOwner, syncControls };
})();
