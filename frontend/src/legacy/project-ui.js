'use strict';
(() => {
  const base = () => `/projects/${state.project}`;
  const oldSettings = settings;
  settings = async () => {
    await oldSettings(); const sequence = state.sequence;
    const summary = await api(base() + '/summary'); if (sequence !== state.sequence) return;
    const stats = summary.stats;
    $('.settings-grid').insertAdjacentHTML('beforebegin', `<section class="project-overview"><div class="section-heading"><div><h2>${esc(state.meta.project.name)}</h2><p>${esc(state.meta.project.description || '规划项目目标，跟踪团队交付。')}</p></div>${state.user.admin ? button('edit-project', '编辑项目资料') : ''}</div><div class="project-metrics">${[['total','工作项'],['open','未完成'],['completed','已完成'],['blocked','受阻'],['overdue','逾期']].map(([key,label]) => `<button type="button" data-action="project-metric" data-metric="${key}"><strong>${stats[key]}</strong><span>${label}</span></button>`).join('')}<div><strong>${stats.remaining_work}<small> h</small></strong><span>剩余工时</span></div></div><div class="project-type-summary">${summary.by_type.map(t => `<span>${typeIcon(t.type)} ${esc(typeNames[t.type])} <b>${t.count}</b></span>`).join('')}</div></section>`);
    for (const link of document.querySelectorAll('.iteration-row')) {
      const id = Number(new URL(link.href).hash.match(/iteration_id=(\d+)/)?.[1]);
      const iteration = summary.iterations.find(i => i.id === id); if (!iteration) continue;
      const entry = document.createElement('div'); entry.className = 'iteration-entry'; link.before(entry); entry.append(link);
      link.querySelector('div').insertAdjacentHTML('beforeend', `<small>${iteration.completed} / ${iteration.total} 项完成 · ${iteration.remaining_work} h 剩余</small>`);
      if (writable()) entry.insertAdjacentHTML('beforeend', button('edit-iteration', '编辑', `data-id="${id}"`, 'quiet') + button('delete-iteration', '删除', `data-id="${id}"`, 'quiet danger'));
    }
  };

  const oldOpen = openItem;
  let parentSearchSequence = 0, parentTimer;
  openItem = async (...args) => {
    await oldOpen(...args);
    const parent = $('[name="parent_id"]', dialog);
    if (!parent || parent.disabled || $('.parent-picker', dialog)) return;
    parent.closest('.field').insertAdjacentHTML('beforebegin', '<div class="parent-picker"><label class="field"><span>搜索父工作项</span><input type="search" data-parent-search placeholder="输入标题或编号…" autocomplete="off" aria-label="搜索父工作项"></label><div class="parent-results" aria-live="polite"></div></div>');
  };
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-parent-search]')) return;
    // The search text is not part of the editable work item.
    state.dirty = JSON.stringify([...new FormData($('#modal-form'))].filter(([key]) => key !== 'comment')) !== state.editorSnapshot;
    clearTimeout(parentTimer); const ticket = ++parentSearchSequence; const search = event.target; const text = search.value.trim();
    const results = $('.parent-results', dialog); if (!text) { results.innerHTML = ''; return; }
    results.textContent = '搜索中…';
    parentTimer = setTimeout(async () => {
      try {
        const found = await api(base() + '/items?' + new URLSearchParams({view:'all',include_completed:'true',q:text,limit:'12'}));
        if (ticket !== parentSearchSequence || !search.isConnected) return;
        const items = found.items.filter(i => i.id !== state.detail?.id);
        results.innerHTML = items.map(i => button('choose-parent', `${typeIcon(i.type)}<span>#${i.id} ${esc(i.title)}</span>`, `data-id="${i.id}"`, 'quiet')).join('') || '<p class="muted">没有匹配的工作项。</p>';
      } catch (error) { if (ticket === parentSearchSequence && search.isConnected) results.textContent = error.message; }
    }, 250);
  });

  const oldCell = cell;
  cell = (item, key) => {
    const content = oldCell(item, key);
    return key === 'assignee' && writable() && !item.deleted ? button('quick-edit-item', content, `data-id="${item.id}" title="快速修改负责人"`, 'quiet quick-field') : content;
  };
  const oldHandle = handle;
  handle = async (action, element) => {
    const id = Number(element.dataset.id);
    if (action === 'edit-project') {
      const original = {...state.meta.project};
      modal('编辑项目资料', field('项目名称',input('name',original.name,'required maxlength="100"')) + field('项目说明',`<textarea name="description" rows="5" maxlength="2000">${esc(original.description)}</textarea>`) + '<p class="hint">更改名称不会自动改写工作项的 Area Path。</p>',async form => {
        await api(base(),{method:'PATCH',body:{...Object.fromEntries(new FormData(form)),expected:original}});
        closeDialog(true);state.projects=await api('/projects');await render();toast('项目资料已更新');
      });return;
    }
    if (action === 'edit-iteration' || action === 'delete-iteration') {
      const original = state.meta.iterations.find(i => i.id === id); if (!original) throw Error('请刷新后重试');
      if (action === 'delete-iteration') {
        if (!confirm(`删除迭代“${original.name}”？仅可删除没有工作项、且未设为团队默认值的迭代。`)) return;
        await api(base()+`/iterations/${id}`,{method:'DELETE',body:{expected:original}});await render();toast('空迭代已删除');return;
      }
      modal('编辑迭代',field('名称',input('name',original.name,'required maxlength="100"')) + '<div class="two-fields">' + field('开始日期',input('start_date',original.start_date,'type="date" required')) + field('结束日期',input('end_date',original.end_date,'type="date" required')) + '</div><p class="hint">已有工作项继续属于此迭代；现有休假日期必须包含在新范围内。</p>',async form => {
        await api(base()+`/iterations/${id}`,{method:'PATCH',body:{...Object.fromEntries(new FormData(form)),expected:original}});closeDialog(true);await render();toast('迭代已更新');
      });return;
    }
    if (action === 'project-metric') {
      const key = element.dataset.metric;
      const rules = key === 'blocked' ? [{field:'blocked',op:'=',value:'1'},{field:'state',op:'notIn',value:'Done;Removed'}] : key === 'overdue' ? [{field:'target_date',op:'notEmpty',value:''},{field:'target_date',op:'<',value:'@Today'},{field:'state',op:'notIn',value:'Done;Removed'}] : key === 'open' ? [{field:'state',op:'notIn',value:'Done;Removed'}] : key === 'completed' ? [{field:'state',op:'=',value:'Done'}] : [{field:'state',op:'!=',value:'Removed'}];
      go('workitems',{view:'all',include_completed:'true',clauses:JSON.stringify({group:'AND',rules})});return;
    }
    if (action === 'choose-parent') {
      const parent = $('[name="parent_id"]',dialog); parent.value=String(id);parent.dispatchEvent(new Event('input',{bubbles:true}));
      $('.parent-results',dialog).textContent=`已选择 #${id}，保存工作项后生效。`;return;
    }
    if (action === 'quick-edit-item') {
      const item = state.items.find(i=>i.id===id); if (!item || item.deleted || !writable()) return;
      modal(`快速编辑 #${id}`,`<p>${esc(item.title)}</p>` + field('状态',select('state',[...new Set([...state.meta.types[item.type],item.state])].map(s=>option(s,s,item.state)).join(''))) + field('负责人',select('assignee_id',option('','未分配',item.assignee_id)+state.meta.members.map(m=>option(m.id,m.name,item.assignee_id)).join(''))) + '<div class="two-fields">' + field('优先级',select('priority',[1,2,3,4].map(p=>option(p,`P${p}`,item.priority)).join(''))) + field('剩余工时',input('remaining_work',item.remaining_work,'type="number" min="0" max="100000" step="0.01" required')) + '</div>',async form=>{
        const data=Object.fromEntries(new FormData(form));data.assignee_id=Number(data.assignee_id)||null;data.priority=Number(data.priority);data.remaining_work=Number(data.remaining_work);data.version=item.version;
        await api(`/items/${id}`,{method:'PATCH',body:data});closeDialog(true);await render();toast('工作项已更新');
      });return;
    }
    await oldHandle(action,element);
  };
})();
