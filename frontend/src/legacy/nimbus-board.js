'use strict';
window.NimbusBoard = (() => {
  const icon=name=>AzureUI.icon(name),cmd=(action,glyph,label,attrs='',css='quiet')=>button(action,icon(glyph)+label,attrs,css);
  const opened=new Map();let data;
  const key=name=>`nimbus-${state.project}-${data?.team.id}-${state.filters.level||'backlog'}-${name}`;
  const compact=()=>pref(key('compact'),false);
  const collapsed=()=>pref(key('collapsed'),[]);
  function counts(item){return (item.child_counts||[]).filter(c=>c.total>0).sort((a,b)=>['Task','Bug','Product Backlog Item','Feature','Epic'].indexOf(a.type)-['Task','Bug','Product Backlog Item','Feature','Epic'].indexOf(b.type));}
  function cardMenu(item){
    const attrs=`data-id="${item.id}"`;
    return cmd('open-related','list','Open',attrs)+(writable()?cmd('nimbus-title','edit','Edit title',attrs):'')+cmd('copy-item-link','link','Copy link',attrs)+(writable()?cmd('nimbus-move-column','arrow','Move to column',attrs)+cmd('nimbus-move-iteration','sprint','Move to iteration',attrs)+cmd('nimbus-move-position','list','Move to position',attrs)+cmd('nimbus-add-child','task','Add Task',attrs+' data-type="Task"')+cmd('nimbus-add-child','bug','Add Bug',attrs+' data-type="Bug"')+cmd('nimbus-delete','trash','Delete',attrs):'');
  }
  function card(item,fields){
    const hasPerson=fields.includes('assignee')&&item.assignee_name;
    return `<article class="work-card ${typeClass(item.type)} advanced-card nimbus-card" data-drag="${item.id}" draggable="${writable()}" tabindex="0" aria-label="${esc(item.type+', '+item.title)}"><div class="card-top">${fields.includes('priority')?`<span class="priority">P${item.priority}</span>`:''}</div><button class="card-title" data-open="${item.id}">${typeIcon(item.type)}<b class="card-id">${item.id}</b>${esc(item.title)}</button><details class="overflow-menu nimbus-card-menu"><summary aria-label="Work item actions" title="Work item actions">${icon('more')}</summary><div>${cardMenu(item)}</div></details><div class="nimbus-card-fields" ${compact()?'hidden':''}><div class="card-state">${button('nimbus-edit-field',dot(item.state, item.type),`data-id="${item.id}" data-field="state" ${!writable()?'disabled':''}`,'quiet')}</div>${hasPerson?`<div class="card-bottom">${button('nimbus-edit-field',avatar(item.assignee_name)+`<span>${esc(item.assignee_name)}</span>`,`data-id="${item.id}" data-field="assignee_id" ${!writable()?'disabled':''}`,'quiet person')}</div>`:''}${fields.includes('estimate')&&Number(item.estimate)>0?`<div class="nimbus-effort">Effort <span>${item.estimate}</span></div>`:''}${fields.includes('tags')?AzureUI.cardTags(item.tags):''}${fields.includes('remaining_work')?`<div class="remaining-work"><span>Remaining Work</span><b>${item.remaining_work}</b></div>`:''}${counts(item).length?`<div class="nimbus-annotations">${counts(item).map(c=>button('nimbus-annotation',typeIcon(c.type)+`${c.completed}/${c.total}`,`data-id="${item.id}" data-type="${esc(c.type)}" aria-expanded="${opened.get(item.id)===c.type}" aria-label="${c.completed} of ${c.total} ${esc(c.type)} completed"`,'quiet')).join('')}</div><div class="nimbus-annotation-details" data-annotation-for="${item.id}" hidden></div>`:''}</div></article>`;
  }
  function board(config,items){
    data=config;const closed=collapsed(),def=data.definition;
    return `<div class="ado-board-scroll nimbus-board-scroll">${def.lanes.map(lane=>`<section class="swimlane"><h2 class="lane-title">${esc(lane.name)}</h2><div class="ado-board">${def.columns.map((col,index)=>{
      const cards=items.filter(i=>i.board_column===col.id&&i.board_lane===lane.id),count=data.items.filter(i=>i.board_column===col.id).length,edge=index===0||index===def.columns.length-1,isClosed=closed.includes(col.id);
      return `<section class="ado-column ${col.split?'split-column':''} ${isClosed?'nimbus-column-collapsed':''}" data-nimbus-column="${esc(col.id)}"><div class="ado-column-heading"><h3>${esc(col.name)}</h3>${!edge?`<span class="wip ${col.limit&&count>col.limit?'over':''}"><span>${count}</span>${col.limit?`<small>/${col.limit}</small>`:''}</span>`:cmd('nimbus-collapse-column',isClosed?'chevronRight':'chevronLeft','',`data-column="${esc(col.id)}" aria-label="${isClosed?'Expand':'Collapse'} ${esc(col.name)} column" aria-expanded="${!isClosed}"`)}${col.description?`<details class="definition"><summary title="Definition of done">${icon('help')}</summary><p>${esc(col.description)}</p></details>`:''}</div><div class="subcolumns" ${isClosed?'hidden':''}>${(col.split?[0,1]:[0]).map(done=>`<div class="board-drop-zone" data-board-drop="${esc(col.id)}" data-lane="${esc(lane.id)}" data-done="${done}">${col.split?`<div class="subheading">${done?'Done':'Doing'}</div>`:''}${index===0?`<div class="nimbus-incoming">${writable()?cmd('quick-item','plus','New item',`data-column="${esc(col.id)}" data-lane="${esc(lane.id)}"`,'quiet quick-add'):''}${cmd('nimbus-search-incoming','search','',`aria-label="Search incoming work items"`)}</div>`:''}${cards.filter(i=>!col.split||Number(i.column_done)===done).map(i=>card(i,def.card_fields)).join('')}</div>`).join('')}</div></section>`;
    }).join('')}</div></section>`).join('')}</div>${data.total>2000?'<p class="notice">仅显示前 2000 项，请缩小团队范围。</p>':''}${items.some(i=>i.board_column==='unmapped')?`<div class="notice">部分工作项状态未映射到看板列。</div><div class="unmapped-cards">${items.filter(i=>i.board_column==='unmapped').map(i=>card(i,def.card_fields)).join('')}</div>`:''}`;
  }
  async function annotation(id,type){
    const container=document.querySelector(`[data-annotation-for="${id}"]`);if(!container)return;
    const detail=await api(`/items/${id}`);if(!container.isConnected||opened.get(id)!==type)return;
    const children=detail.children.filter(c=>c.type===type&&c.state!=='Removed');
    container.innerHTML=(writable()?cmd('nimbus-add-child','plus','Add '+esc(type),`data-id="${id}" data-type="${esc(type)}"`):'')+children.map(c=>`<div class="nimbus-child-row"><input type="checkbox" data-nimbus-child="${c.id}" data-parent="${id}" data-type="${esc(type)}" aria-label="${esc(c.title)}" ${c.state==='Done'?'checked':''} ${!writable()?'disabled':''}>${typeIcon(type)}${c.assignee_name?avatar(c.assignee_name):'<span class="nimbus-empty-avatar"></span>'}${button('open-related',esc(c.title),`data-id="${c.id}" title="${esc(c.title)}"`,'quiet nimbus-child-title')}</div>`).join('');container.hidden=false;
  }
  async function enhance(sequence){
    if(state.page!=='board'||!data)return;
    const header=$('.reference-team-header'),team=$('.team-toolbar>div',header),tools=$('.reference-view-tools',header);
    if(!header||!tools)return;
    if(!$('.nimbus-team-favorite',header)){
      $('.divider',team)?.remove();
      $(':scope>.ui-icon',team).outerHTML=icon('boardsNav');
      $('[data-action=view-backlog]',header).innerHTML=icon('backlogView')+'<span>View as backlog</span>';
      team.insertAdjacentHTML('beforeend',cmd('nimbus-team-favorite','star','',`aria-label="${pref(key('favorite'),false)?'Remove from favorites':'Add to favorites'}" aria-pressed="${pref(key('favorite'),false)}"`,'quiet nimbus-team-favorite')+cmd('nimbus-team-profile','users','','aria-label="Show Team Profile"'));
      const level=$('[name=level]',tools);level.insertAdjacentHTML('beforebegin',icon('boardsNav'));
      level.insertAdjacentHTML('afterend',cmd('nimbus-compact','cardFields','',`aria-label="${compact()?'Expand':'Collapse'} card fields" title="${compact()?'Expand':'Collapse'} card fields" aria-pressed="${compact()}"`));
      tools.insertAdjacentHTML('beforeend',cmd('nimbus-fullscreen','expand','','aria-label="Enter full screen mode" title="Full screen"'));
    }
    await Promise.all([...opened].map(([id,type])=>sequence===state.sequence?annotation(id,type):null));
  }
  const previousRender=MiniBoards.renderPage;
  MiniBoards.renderPage=async sequence=>{const handled=await previousRender(sequence);if(handled&&sequence===state.sequence)await enhance(sequence);return handled;};
  const oldHandle=handle;
  handle=async(action,element)=>{
    const id=Number(element.dataset.id);
    if(action==='nimbus-fullscreen'){const active=$('.azure-shell').classList.toggle('nimbus-fullscreen');element.setAttribute('aria-label',active?'Exit full screen mode':'Enter full screen mode');return;}
    if(['nimbus-title','nimbus-move-column','nimbus-move-iteration','nimbus-move-position','nimbus-delete'].includes(action)){
      const item=state.items.find(i=>i.id===id);if(!item||!writable())return;
      const patch=async changes=>{await api(`/items/${id}`,{method:'PATCH',body:{...changes,version:item.version}});closeDialog(true);await render();};
      if(action==='nimbus-title'){
        element.closest('details').open=false;const title=document.querySelector(`.nimbus-card[data-drag="${id}"] .card-title`);
        title.outerHTML=input('nimbus-inline',item.title,`data-nimbus-edit="${id}" data-field="title" maxlength="300" required aria-label="Title"`);$('[data-nimbus-edit]').focus();return;
      }
      if(action==='nimbus-move-iteration')return modal('Move to iteration',field('Iteration',select('iteration_id',option('','Unassigned',item.iteration_id)+state.meta.iterations.map(i=>option(i.id,i.name,item.iteration_id)).join(''))),async form=>patch({iteration_id:Number(form.elements.iteration_id.value)||null}));
      if(action==='nimbus-move-column')return modal('Move to column',field('Column',select('column',data.definition.columns.filter(c=>c.mappings[item.type]).map(c=>option(c.id,c.name,item.board_column)).join(''))),async form=>{
        await api(`/projects/${state.project}/board?team_id=${data.team.id}&level=${state.filters.level||'backlog'}`,{method:'POST',body:{item_id:id,version:item.version,board_version:data.version,column_id:form.elements.column.value,lane_id:item.board_lane,column_done:0}});closeDialog(true);await render();
      });
      if(action==='nimbus-move-position'){
        const siblings=data.items.filter(i=>i.type===item.type&&i.id!==id);
        return modal('Move to position',field('Position',input('position',1,`type="number" min="1" max="${siblings.length+1}" required`)),async form=>{
          await api(`/projects/${state.project}/reorder`,{method:'POST',body:{id,version:item.version,before_id:siblings[Number(form.elements.position.value)-1]?.id||null}});closeDialog(true);await render();
        });
      }
      if(action==='nimbus-delete'&&confirm('Delete this work item? You can restore it from the recycle bin.')){await api(`/items/${id}`,{method:'DELETE',body:{version:item.version}});await render();}return;
    }
    if(action==='nimbus-annotation'){
      const type=element.dataset.type;if(opened.get(id)===type){opened.delete(id);document.querySelector(`[data-annotation-for="${id}"]`).hidden=true;}
      else {opened.set(id,type);await annotation(id,type);}
      element.closest('.nimbus-annotations').querySelectorAll('button').forEach(b=>b.setAttribute('aria-expanded',String(opened.get(id)===b.dataset.type)));return;
    }
    if(action==='nimbus-add-child'){
      const parent=(await api(`/items/${id}`)).item,type=element.dataset.type;
      return openItem(undefined,{parent_id:id,type,state:state.meta.types[type][0],iteration_id:parent.iteration_id,area:parent.area});
    }
    if(action==='nimbus-compact'){savePref(key('compact'),!compact());return render();}
    if(action==='nimbus-collapse-column'){const ids=collapsed(),column=element.dataset.column;savePref(key('collapsed'),ids.includes(column)?ids.filter(c=>c!==column):[...ids,column]);return render();}
    if(action==='nimbus-team-favorite'){const value=!pref(key('favorite'),false);savePref(key('favorite'),value);element.setAttribute('aria-pressed',String(value));element.setAttribute('aria-label',value?'Remove from favorites':'Add to favorites');return;}
    if(action==='nimbus-team-profile')return modal('Team Profile',`<h2>${esc(data.team.name)}</h2><p>${esc(state.meta.project.name)}</p><div class="nimbus-team-members">${state.meta.members.map(m=>`<div>${avatar(m.name)}<span>${esc(m.name)}</span><small>${esc(m.role)}</small></div>`).join('')}</div>`,async()=>closeDialog(true),'Close');
    if(action==='nimbus-search-incoming'){const filter=$('#filters');filter.hidden=false;savePref('board-filter-visible',true);$('[name=q]',filter).focus();return;}
    if(action==='nimbus-edit-field'){
      const item=state.items.find(i=>i.id===id),field=element.dataset.field;if(!item||!writable())return;
      const options=field==='state'?state.meta.types[item.type].map(s=>option(s,s,item.state)).join(''):option('','Unassigned',item.assignee_id)+state.meta.members.map(m=>option(m.id,m.name,item.assignee_id)).join('');
      element.outerHTML=select('nimbus-inline',options,`data-nimbus-edit="${id}" data-field="${field}" aria-label="${field==='state'?'State':'Assigned To'}"`);$('[data-nimbus-edit]').focus();return;
    }
    return oldHandle(action,element);
  };
  document.addEventListener('change',async event=>{
    const el=event.target;
    if(!el.dataset.nimbusChild&&!el.dataset.nimbusEdit)return;
    const itemId=Number(el.dataset.nimbusChild||el.dataset.nimbusEdit);el.disabled=true;
    try{
      const item=(await api(`/items/${itemId}`)).item;
      const changes=el.dataset.nimbusChild?{state:el.checked?'Done':state.meta.types[item.type][0]}:{[el.dataset.field]:el.dataset.field==='assignee_id'?Number(el.value)||null:el.value};
      // For inline fields, use the displayed revision to reject concurrent edits.
      const version=el.dataset.nimbusEdit?state.items.find(i=>i.id===itemId).version:item.version;
      await api(`/items/${itemId}`,{method:'PATCH',body:{...changes,version}});await render();
    }catch(error){toast(error.message);el.disabled=false;if(el.type==='checkbox')el.checked=!el.checked;}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){
    if(event.target.matches?.('[data-nimbus-edit]')){event.preventDefault();render();}
    if($('.nimbus-fullscreen')){$('.nimbus-fullscreen').classList.remove('nimbus-fullscreen');$('[data-action=nimbus-fullscreen]')?.setAttribute('aria-label','Enter full screen mode');}
  }});
  return {board,card};
})();
