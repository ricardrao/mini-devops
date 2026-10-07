'use strict';
window.DeliveryUI = (() => {
  names.delivery = 'Delivery Plans';
  const day = 86400000, levels = {backlog:'Backlog items',features:'Features',epics:'Epics',tasks:'Tasks / Bugs',bugs:'Bugs'};
  const dateNumber = value => Date.parse(value + 'T00:00:00Z');
  const iso = value => new Date(value).toISOString().slice(0,10);
  const sunday = () => { const now=new Date(); return iso(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-now.getUTCDay())); };
  const base = () => `/projects/${state.project}/delivery-plans`;
  const icon = name => AzureUI.icon(name);
  const command = (action,name,label,attrs='',cls='quiet') => button(action,icon(name)+label,attrs,cls);
  let plan, plans=[], editingRows=[], metadata=new Map(), dragged=null;
  async function meta(pid) { if(!metadata.has(pid)) metadata.set(pid,await api(`/projects/${pid}`)); return metadata.get(pid); }
  function openScoped(id,pid) {
    if (pid === state.project) return openItem(id);
    if (dialog.open && !closeDialog()) return;
    go('workitems',{project:pid,view:'all',item:id});
  }
  async function renderPage(sequence) {
    if(state.page!=='delivery') return false;
    const id=Number(state.filters.plan);
    if(!id) {
      plans=await api(base()); if(sequence!==state.sequence)return true; plan=null;
      $('#page-content').innerHTML=`<div class="delivery-heading"><h1>Delivery Plans</h1>${writable()?command('delivery-new','plus','New plan','','primary'):''}</div><p class="hint">在同一时间线上查看多个项目、团队的迭代排期与前后置依赖。</p><div class="delivery-plan-list"><table><thead><tr><th>Name</th><th>Description</th><th>Last modified by</th><th>Last modified</th></tr></thead><tbody>${plans.map(p=>`<tr><td>${button('delivery-open',icon('calendar')+esc(p.name),`data-id="${p.id}"`,'quiet link')}</td><td>${esc(p.description)}</td><td>${esc(p.changed_by_name)}</td><td>${date(p.changed)}</td></tr>`).join('')}</tbody></table>${plans.length?'':'<div class="empty"><h2>创建交付计划</h2><p>选择团队与待办层级，按迭代查看交付进度。</p></div>'}</div>`;
      return true;
    }
    const weeks=[4,8,12].includes(Number(state.filters.weeks))?Number(state.filters.weeks):8;
    const start=state.filters.start||sunday();
    plan=await api(`${base()}/${id}?${new URLSearchParams({start,end:iso(dateNumber(start)+(weeks*7-1)*day)})}`);
    if(sequence!==state.sequence)return true;
    draw(); return true;
  }
  function itemButton(item,row) { return button('scoped-item',`<b>${item.id}</b> ${esc(item.title)}`,`data-id="${item.id}" data-project="${row.project_id}"`,'quiet delivery-item-title'); }
  function card(item,row,index) {
    return `<article class="delivery-card type-${item.type==='Bug'?'bug':item.type==='Task'?'task':item.type==='Feature'?'feature':'backlog'}" ${row.can_edit?'draggable="true"':''} data-delivery-item="${item.id}" data-row="${index}">${itemButton(item,row)}<div class="delivery-card-state">${esc(item.state)}</div><div class="delivery-card-person">${avatar(item.assignee_name||'?')} ${esc(item.assignee_name||'Unassigned')}</div>${Number(item.child_count)>0?`<small>${item.child_done} / ${item.child_count} 子项完成</small>`:''}${row.can_edit?command('delivery-schedule','calendar','Schedule',`data-id="${item.id}" data-row="${index}"`):''}</article>`;
  }
  function draw() {
    const start=dateNumber(plan.start_date), days=Math.round((dateNumber(plan.end_date)-start)/day)+1;
    $('#page-content').innerHTML=`<div class="delivery-heading"><div>${button('delivery-list','‹ Delivery Plans','','quiet')}<h1>${esc(plan.name)}</h1></div><div class="commands">${plan.can_edit?command('delivery-edit','settings','Settings')+command('delivery-delete','trash','Delete plan'):''}${command('delivery-refresh','refresh','Refresh')}</div></div>${plan.description?`<p class="hint">${esc(plan.description)}</p>`:''}${plan.restricted?'<p class="delivery-notice">部分团队不在你的项目访问权限内，已隐藏。</p>':''}<div class="delivery-toolbar"><div>${command('delivery-shift','chevronLeft','', 'data-shift="-1" aria-label="Previous weeks"')}${button('delivery-today','Today','','quiet')}${command('delivery-shift','chevronRight','', 'data-shift="1" aria-label="Next weeks"')}<span>${plan.start_date} — ${plan.end_date}</span></div><div><label>时间窗口 ${select('delivery-weeks',[4,8,12].map(n=>option(n,`${n} weeks`,days/7)).join(''))}</label><label><input type="checkbox" id="delivery-show-empty" ${state.filters.empty==='true'?'checked':''}> Show empty iterations</label><label><input type="checkbox" id="delivery-show-dependencies" ${state.filters.dependencies==='false'?'':'checked'}> Dependencies</label></div></div><div class="delivery-scroll"><div class="delivery-timeline"><div class="delivery-calendar"><div class="delivery-team-cell">Team / Backlog level</div><div class="delivery-track delivery-dates">${Array.from({length:Math.ceil(days/7)},(_,i)=>`<div>${iso(start+i*7*day).slice(5)}</div>`).join('')}</div></div>${plan.rows.map((row,index)=>`<section class="delivery-team-row"><div class="delivery-team-cell"><strong>${esc(row.team_name)}</strong><span>${esc(row.project_name)}</span><small>${levels[row.level]}</small><details><summary>Unscheduled (${row.items.filter(i=>!i.iteration_id).length})</summary>${row.items.filter(i=>!i.iteration_id).map(i=>card(i,row,index)).join('')}</details></div><div class="delivery-track delivery-iterations">${row.iterations.filter(iteration=>state.filters.empty==='true'||row.items.some(i=>i.iteration_id===iteration.id)).map(iteration=>`<section class="delivery-iteration" data-start="${iteration.start_date}" data-end="${iteration.end_date}" data-iteration="${iteration.id}" data-row="${index}"><header><strong>${esc(iteration.name)}</strong><span>${iteration.start_date.slice(5)} — ${iteration.end_date.slice(5)}</span></header><div>${row.items.filter(i=>i.iteration_id===iteration.id).map(i=>card(i,row,index)).join('')||'<p class="delivery-empty">No scheduled work items in this window. Use Schedule or Show empty iterations.</p>'}</div></section>`).join('')||'<p class="delivery-empty">No scheduled work items in this window. Use Schedule or Show empty iterations.</p>'}</div></section>`).join('')}</div></div><section class="delivery-dependencies" ${state.filters.dependencies==='false'?'hidden':''}><h2>Dependencies</h2>${dependencies()}</section>`;
    document.querySelectorAll('.delivery-track').forEach(el=>el.style.gridTemplateColumns=`repeat(${days}, 32px)`);
    document.querySelectorAll('.delivery-iterations').forEach(track=>{
      const lanes=[];
      track.querySelectorAll('.delivery-iteration').forEach(el=>{
        const from=Math.max(0,Math.round((dateNumber(el.dataset.start)-start)/day)),to=Math.min(days,Math.round((dateNumber(el.dataset.end)-start)/day)+1);
        let lane=lanes.findIndex(end=>end<=from);if(lane<0)lane=lanes.length;lanes[lane]=to;
        el.style.gridColumn=`${from+1} / ${to+1}`;el.style.gridRow=String(lane+1);
      });
    });
    const today=Math.floor((Date.now()-start)/day);
    if(today>=0&&today<days)document.querySelectorAll('.delivery-track').forEach(el=>{const marker=document.createElement('span');marker.className='delivery-today-line';marker.style.left=`${today*32}px`;marker.title='Today (UTC)';el.append(marker);});
  }
  function dependencies() {
    const byId=new Map();for(const row of plan.rows)for(const item of row.items)byId.set(item.id,{item,row,iteration:row.iterations.find(i=>i.id===item.iteration_id)});
    return plan.dependencies.map(link=>{
      const from=byId.get(link.source_id),to=byId.get(link.target_id);
      const conflict=from.iteration.end_date>to.iteration.start_date && !['Done','Closed','Removed'].includes(from.item.state);
      return `<div class="delivery-dependency ${conflict?'dependency-warning':''}"><span>Predecessor</span>${itemButton(from.item,from.row)}<span>→ Successor</span>${itemButton(to.item,to.row)}<span>${conflict?'排期重叠：前置项尚未完成':'排期无冲突'}</span></div>`;
    }).join('')||'<p class="hint">当前时间窗口没有可见的前后置依赖。可在工作项的 Links 中添加 Predecessor / Successor，支持跨项目。</p>';
  }
  function editorRows() {
    return editingRows.map((r,index)=>`<div class="delivery-config-row" data-config-row="${index}"><label>Project ${select('project-'+index,state.projects.map(p=>option(p.id,p.name,r.project_id)).join(''),'data-plan-project="'+index+'"')}</label><label>Team ${select('team-'+index,(metadata.get(r.project_id)?.teams||[]).map(t=>option(t.id,t.name,r.team_id)).join(''),'required')}</label><label>Backlog level ${select('level-'+index,Object.entries(levels).map(([v,n])=>option(v,n,r.level)).join(''))}</label>${button('delivery-remove-row',icon('close'),`data-row="${index}" aria-label="Remove team"`,'quiet')}</div>`).join('');
  }
  function readRows() {
    editingRows=editingRows.map((r,index)=>({project_id:Number($(`[name="project-${index}"]`,dialog).value),team_id:Number($(`[name="team-${index}"]`,dialog).value),level:$(`[name="level-${index}"]`,dialog).value}));
  }
  async function editPlan(create=false) {
    metadata.clear();
    editingRows=create?[{project_id:state.project,team_id:state.meta.teams[0]?.id,level:'backlog'}]:plan.rows.map(r=>({project_id:r.project_id,team_id:r.team_id,level:r.level}));
    await Promise.all([...new Set(editingRows.map(r=>r.project_id))].map(meta));
    modal(create?'New delivery plan':'Delivery plan settings',field('Name',input('name',create?'':plan.name,'required maxlength="100"'))+field('Description',input('description',create?'':plan.description,'maxlength="2000"'))+'<div class="delivery-config-rows">'+editorRows()+'</div>'+command('delivery-add-row','plus','Add team')+'<p class="hint">可添加多个项目和团队；同一团队可选择不同待办层级。</p>',async form=>{
      readRows();const data={name:form.elements.name.value,description:form.elements.description.value,rows:editingRows};if(!create)data.version=plan.version;
      const saved=await api(base()+(create?'':'/'+plan.id),{method:create?'POST':'PATCH',body:data});closeDialog(true);toast('交付计划已保存');go('delivery',{plan:saved.id,start:state.filters.start||sunday(),weeks:state.filters.weeks||8});
    });
    dialog.classList.add('delivery-plan-dialog');
  }
  async function schedule(id,index,iteration) {
    const row=plan.rows[index], item=row?.items.find(i=>i.id===id);if(!item||!row.can_edit)return;
    const save=async iteration_id=>{await api(`/items/${id}`,{method:'PATCH',body:{iteration_id,version:item.version}});toast('排期已保存');await render();};
    if(iteration!==undefined)return save(iteration);
    // Always refresh target project metadata; iteration settings may have changed elsewhere.
    const details=await api(`/projects/${row.project_id}`);
    modal('Schedule work item',`<p>#${id} ${esc(item.title)}</p>`+field('Iteration',select('iteration_id',option('','Unscheduled',item.iteration_id)+(details.iterations||[]).map(i=>option(i.id,`${i.name} (${i.start_date} — ${i.end_date})`,item.iteration_id)).join(''))),async form=>{const value=Number(form.elements.iteration_id.value)||null;closeDialog(true);await save(value);});
  }
  const previousRender=MiniBoards.renderPage;
  MiniBoards.renderPage=async sequence=>state.page==='delivery'?renderPage(sequence):previousRender(sequence);
  const previousHandle=handle;
  handle=async(action,element)=>{
    if(action==='scoped-item')return openScoped(Number(element.dataset.id),Number(element.dataset.project));
    if(action==='delivery-list')return go('delivery',{});
    if(action==='delivery-open')return go('delivery',{plan:element.dataset.id});
    if(action==='delivery-new')return editPlan(true);
    if(action==='delivery-edit')return editPlan();
    if(action==='delivery-refresh')return render();
    if(action==='delivery-delete') {if(confirm('删除此交付计划？工作项和迭代会保留。')){await api(base()+'/'+plan.id,{method:'DELETE',body:{version:plan.version}});go('delivery',{});}return;}
    if(action==='delivery-shift'||action==='delivery-today')return go('delivery',{...state.filters,start:action==='delivery-today'?sunday():iso(dateNumber(plan.start_date)+Number(element.dataset.shift)*28*day)});
    if(action==='delivery-add-row'){readRows();if(editingRows.length>=20)throw Error('最多 20 个团队行');const m=await meta(state.project);editingRows.push({project_id:state.project,team_id:m.teams[0]?.id,level:'backlog'});$('.delivery-config-rows',dialog).innerHTML=editorRows();return;}
    if(action==='delivery-remove-row'){readRows();editingRows.splice(Number(element.dataset.row),1);$('.delivery-config-rows',dialog).innerHTML=editorRows();return;}
    if(action==='delivery-schedule')return schedule(Number(element.dataset.id),Number(element.dataset.row));
    return previousHandle(action,element);
  };
  document.addEventListener('change',async event=>{
    try {
      if(event.target.name==='delivery-weeks')go('delivery',{...state.filters,weeks:event.target.value});
      if(event.target.id==='delivery-show-empty'){state.filters.empty=String(event.target.checked);draw();}
      if(event.target.id==='delivery-show-dependencies'){state.filters.dependencies=String(event.target.checked);$('.delivery-dependencies').hidden=!event.target.checked;}
      if(event.target.dataset.planProject!==undefined){readRows();const index=Number(event.target.dataset.planProject),m=await meta(editingRows[index].project_id);editingRows[index].team_id=m.teams[0]?.id;$('.delivery-config-rows',dialog).innerHTML=editorRows();}
    }catch(error){toast(error.message);}
  });
  document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-delivery-item]');if(card?.draggable){dragged={id:Number(card.dataset.deliveryItem),row:Number(card.dataset.row)};event.dataTransfer.setData('text/plain',String(dragged.id));event.dataTransfer.effectAllowed='move';}});
  document.addEventListener('dragover',event=>{const cell=event.target.closest('[data-iteration]');if(dragged&&cell&&Number(cell.dataset.row)===dragged.row){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  document.addEventListener('drop',async event=>{const cell=event.target.closest('[data-iteration]');if(!dragged||!cell||Number(cell.dataset.row)!==dragged.row)return;event.preventDefault();const item=dragged;dragged=null;try{await schedule(item.id,item.row,Number(cell.dataset.iteration));}catch(error){toast(error.message);}});
  document.addEventListener('dragend',()=>dragged=null);
  return {openScoped};
})();
