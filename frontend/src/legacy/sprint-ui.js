'use strict';
window.SprintUI = (() => {
  const icon = AzureUI.icon;
  const cycle = '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M2 10h3a4 4 0 1 1 6 0h3M12 8l2 2-2 2"/></svg>';
  const collapseIcon = '<svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 9 4-4 4 4m-8 4 4-4 4 4"/></svg>';
  const triangle = '<svg class="ui-icon" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M1 3h10L6 11z"/></svg>';
  const command = (action, glyph, label, extra = '', css = 'quiet') => button(action, icon(glyph) + `<span>${label}</span>`, extra, css);
  const ordered = () => [...state.meta.iterations].sort((a,b) => a.start_date.localeCompare(b.start_date) || a.id-b.id);
  const phase = i => ({'过去':'Past','当前':'Current','未来':'Future'})[WeeklyPlanning.phase(i)];
  const shortDate = d => new Date(d+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'2-digit',timeZone:'UTC'});
  function label(i) {
    const name = i.name.replace(/\s*\(\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}\)\s*$/, '');
    return `${name} (${shortDate(i.start_date)} - ${shortDate(i.end_date)})`;
  }
  function picker(iteration) {
    return `<details class="sprint-picker"><summary aria-haspopup="listbox" aria-expanded="false"><span>${esc(label(iteration))}</span>${icon('chevron')}</summary><div class="sprint-picker-popup"><label class="sprint-search">${icon('search')}<input type="search" data-sprint-search placeholder="Filter sprints" aria-label="Filter sprints" autocomplete="off"></label><div class="sprint-options" role="listbox" aria-label="Sprints">${ordered().map(i=>`<button type="button" role="option" data-action="jump-iteration" data-id="${i.id}" aria-selected="${i.id===iteration.id}" class="sprint-option ${i.id===iteration.id?'selected':''}" data-search="${esc((i.name+' '+i.start_date+' '+i.end_date).toLowerCase())}"><span class="sprint-check">${i.id===iteration.id?'✓':''}</span>${cycle}<span class="sprint-option-name">${esc(label(i))}</span><span class="sprint-phase ${phase(i).toLowerCase()}">${phase(i)}</span></button>`).join('')}<p class="sprint-no-results" hidden>No matching sprints</p></div>${writable()?`<div class="sprint-picker-footer">${command('new-iteration','plus','New Sprint')}${command('new-weekly-iterations','sprint','连续创建周迭代')}</div>`:''}</div></details>`;
  }
  function header(data, teamBar, tabs, tab) {
    const controls = writable()? command('new-item','plus','New Work Item','','primary') : '';
    const columns = tab==='taskboard'? command('sprint-columns','columns','Column Options') : '';
    const longDate = d=>new Date(d+'T00:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'});
    const person = tab==='taskboard'?select('assignee_id',option('','Person: All',state.filters.assignee_id)+option('0','Unassigned',state.filters.assignee_id)+state.meta.members.map(m=>option(m.id,m.name,state.filters.assignee_id)).join(''),'data-filter aria-label="迭代负责人"'):'';
    return `<div class="sprint-header">${teamBar(controls+columns).replace(icon('users'),cycle)}${tabs({taskboard:'Taskboard',backlog:'Backlog',capacity:'Capacity',analytics:'Analytics'},tab)}<div class="sprint-selectbar">${picker(data.iteration)}${person}<div class="sprint-date"><span>${longDate(data.iteration.start_date)} - ${longDate(data.iteration.end_date)}</span><span>${data.workdays_remaining} work days remaining</span></div></div></div>`;
  }
  function states() {
    const known = [...new Set([...state.meta.types.Bug,...state.meta.types.Task])];
    return [...new Set(['To Do','New','Approved','Active','In Progress','Committed','In Review','Resolved',...known,'Done'])].filter(s=>s!=='Removed');
  }
  function card(item, parent = false) {
    const name = item.assignee_name || state.meta.members.find(m=>m.id===item.assignee_id)?.name || 'Unassigned';
    const initials = name==='Unassigned'?'':name.trim().split(/\s+/).map(p=>Array.from(p)[0]).slice(0,2).join('').toUpperCase();
    const full = {...item,...(parent?state.items.find(i=>i.id===item.id):{})};
    const actions = `<details class="overflow-menu sprint-card-menu" draggable="false"><summary aria-label="Actions for work item ${item.id}" title="Actions">${icon('more')}</summary><div>${command('open-related','list','Open work item',`data-id="${item.id}"`)}${parent&&writable()?command('add-child','plus','New task',`data-id="${item.id}"`):''}${writable()?command('schedule-item','sprint','安排迭代',`data-id="${item.id}"`):''}${command('copy-item-link','link','Copy link',`data-id="${item.id}"`)}</div></details>`;
    return `<article class="work-card sprint-card ${typeClass(item.type)}" ${parent?'':`data-drag="${item.id}" draggable="${writable()}"`}><button class="sprint-card-title" data-open="${item.id}">${AzureUI.typeIcon(item.type)}<b>${item.id}</b>${esc(item.title)}</button>${actions}<div class="card-state">${dot(item.state, item.type)}</div><div class="sprint-person"><span class="sprint-avatar ${name==='Unassigned'?'unassigned':''}">${initials?esc(initials):icon('users')}</span><span title="${esc(name)}">${esc(name)}</span></div>${pref('sprint-card-tags',true)&&full.tags?AzureUI.cardTags(full.tags):''}${pref('sprint-card-work',false)&&!parent?`<div class="remaining-work"><span>Remaining Work</span><b>${item.remaining_work}</b></div>`:''}</article>`;
  }
  function taskboard(data) {
    const tasks = data.items.filter(i=>['Task','Bug'].includes(i.type)&&(!state.filters.assignee_id || String(i.assignee_id||0)===state.filters.assignee_id));
    const allStates = [...new Set([...states(),...tasks.map(i=>i.state)])];
    const chosen = pref('sprint-columns',null), columns = chosen?.length ? allStates.filter(s=>chosen.includes(s)) : allStates;
    const parents = [...new Set(tasks.map(i=>i.parent_id||0))];
    return `<div class="taskboard-scroll"><table class="taskboard"><thead><tr><th aria-label="Parent work item">${button('sprint-collapse-all',collapseIcon+'<span>Collapse all</span>',`aria-expanded="true" ${parents.length?'':'disabled'}`,'quiet sprint-collapse-all')}</th>${columns.map(s=>`<th>${esc(s)}${tasks.some(i=>i.state===s)?` <strong>${tasks.filter(i=>i.state===s).length}</strong>`:''}</th>`).join('')}</tr></thead><tbody>${parents.map(id=>{const parent=data.parents.find(p=>p.id===id);return `<tr data-sprint-parent="${id}"><th class="task-parent">${button('sprint-collapse',triangle,`aria-label="折叠子任务" aria-expanded="true"`,'quiet sprint-collapse')}${parent?card(parent,true):'<span class="sprint-unparented">Unparented</span>'}</th>${columns.map(s=>`<td data-task-state="${esc(s)}">${tasks.filter(i=>(i.parent_id||0)===id&&i.state===s).map(i=>card(i)).join('')}</td>`).join('')}</tr>`}).join('')}</tbody></table>${!parents.length?'<p class="sprint-empty">No tasks match this sprint and person. Add a work item or choose another sprint.</p>':''}</div>`;
  }
  function setCollapsed(row, collapsed) {
    row.classList.toggle('sprint-collapsed',collapsed);const control=$('.sprint-collapse',row);
    control.setAttribute('aria-expanded',String(!collapsed));control.setAttribute('aria-label',collapsed?'展开子任务':'折叠子任务');
  }
  function syncCollapseAll() {
    const all=$('.sprint-collapse-all');if(!all)return;
    const expanded=!!$('.taskboard tbody tr:not(.sprint-collapsed)');all.setAttribute('aria-expanded',String(expanded));$('span',all).textContent=expanded?'Collapse all':'Expand all';
  }
  const oldHandle = handle;
  handle = async (action, element) => {
    if (action === 'sprint-collapse') {
      const row=element.closest('tr');setCollapsed(row,!row.classList.contains('sprint-collapsed'));syncCollapseAll();return;
    }
    if(action==='sprint-collapse-all'){const collapsed=element.getAttribute('aria-expanded')==='true';document.querySelectorAll('.taskboard tbody tr').forEach(row=>setCollapsed(row,collapsed));syncCollapseAll();return;}
    if(action==='sprint-columns') {
      const values=states(), chosen=pref('sprint-columns',values);
      modal('Column Options',`<p>选择 Taskboard 显示的状态列。</p><div class="column-options">${values.map(s=>`<label class="check"><input type="checkbox" name="sprint_column" value="${esc(s)}" ${chosen.includes(s)?'checked':''}>${esc(s)}</label>`).join('')}</div><hr><label class="check"><input type="checkbox" name="show_tags" ${pref('sprint-card-tags',true)?'checked':''}> Show tags</label><label class="check"><input type="checkbox" name="show_work" ${pref('sprint-card-work',false)?'checked':''}> Show Remaining Work</label>`,async form=>{
        const selected=new FormData(form).getAll('sprint_column');if(!selected.length)throw Error('至少保留一个状态列');savePref('sprint-columns',selected);savePref('sprint-card-tags',form.elements.show_tags.checked);savePref('sprint-card-work',form.elements.show_work.checked);closeDialog(true);await render();
      });return;
    }
    return oldHandle(action,element);
  };
  document.addEventListener('toggle',event=>{
    const picker=event.target;if(!picker.matches?.('.sprint-picker'))return;
    $('summary',picker).setAttribute('aria-expanded',String(picker.open));
    if(picker.open){$('[data-sprint-search]',picker).focus({preventScroll:true});$('.sprint-option.selected',picker)?.scrollIntoView({block:'nearest'});}
  },true);
  document.addEventListener('input',event=>{
    if(!event.target.matches('[data-sprint-search]'))return;
    const popup=event.target.closest('.sprint-picker'),query=event.target.value.trim().toLowerCase();let count=0;
    for(const row of popup.querySelectorAll('.sprint-option')){row.hidden=!row.dataset.search.includes(query);if(!row.hidden)count++;}
    $('.sprint-no-results',popup).hidden=!!count;
  });
  document.addEventListener('click',event=>{
    for(const picker of document.querySelectorAll('.sprint-picker[open]'))if(!picker.contains(event.target)||event.target.closest('[data-action]'))picker.open=false;
    const menu=event.target.closest('.sprint-card-menu');if(menu&&event.target.closest('[data-action]'))menu.open=false;
  });
  document.addEventListener('keydown',event=>{
    const cardMenu=event.target.closest('.sprint-card-menu');
    if(cardMenu?.open&&event.key==='Escape'){event.preventDefault();cardMenu.open=false;$('summary',cardMenu).focus();return;}
    const picker=event.target.closest('.sprint-picker');if(!picker)return;
    if(event.key==='Escape'&&picker.open){event.preventDefault();picker.open=false;$('summary',picker).focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!picker.open)return;
    if(event.target.matches('input')&&['Home','End'].includes(event.key))return;
    event.preventDefault();const rows=[...picker.querySelectorAll('.sprint-option:not([hidden])')],index=rows.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?rows.length-1:(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[next]?.focus();
  });
  return {header,taskboard};
})();
