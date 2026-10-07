'use strict';
window.CapacityUI = (() => {
  let data, draft, initial, path;
  const icon=name=>AzureUI.icon(name);
  const fingerprint=()=>JSON.stringify(draft);
  const active=()=>!!$('#capacity-form');
  const dirty=()=>active() && fingerprint()!==initial;
  const dayCount=dates=>dates.filter(day=>data.working_days.includes(new Date(day+'T00:00:00Z').getUTCDay())).length;
  const initials=name=>name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  const person=m=>`<span class="capacity-person"><span class="avatar" aria-hidden="true">${esc(initials(m.name))}</span><span>${esc(m.name)}</span></span>`;
  function controls(){
    if(!active())return;
    $('[data-capacity-save]').disabled=!writable()||!dirty();$('[data-action=capacity-revert]').disabled=!dirty();
    const add=$('[data-action=capacity-add]');add.disabled=!writable()||draft.capacities.length===data.capacities.length;
  }
  function table(){
    const disabled=writable()?'':'disabled';
    return `<div class="capacity-sheet"><table class="capacity-table"><colgroup><col class="capacity-col-person"><col class="capacity-col-days"><col class="capacity-col-activity"><col class="capacity-col-hours"><col class="capacity-col-remove"></colgroup><thead><tr><th>Team member</th><th>Days off</th><th>Activity</th><th>Capacity per day (h)</th><th></th></tr></thead><tbody>${draft.capacities.map(m=>{
      const activities=[...new Set(['','Development','Design','Testing','Documentation','Requirements','Deployment',m.activity])];
      return `<tr data-capacity-user="${m.user_id}"><td>${person(data.capacities.find(u=>u.id===m.user_id))}</td><td>${button('capacity-days',`${dayCount(m.days_off)} days`,`data-id="${m.user_id}" aria-label="编辑个人休假" ${disabled}`,'quiet days-link')}</td><td>${select('activity-'+m.user_id,activities.map(a=>option(a,a||'Unassigned',m.activity)).join(''),`aria-label="活动" ${disabled}`)}</td><td>${input('per_day-'+m.user_id,m.per_day,`type="number" min="0" max="24" step="0.25" aria-label="每日容量" ${disabled}`)}</td><td>${writable()?button('capacity-remove',icon('close'),`data-id="${m.user_id}" aria-label="移除容量成员"`,'quiet capacity-remove'):''}</td></tr>`;
    }).join('')}</tbody><tfoot><tr><td>Team days off</td><td>${button('capacity-days',`${dayCount(draft.team_days_off)} days`,`data-id="0" aria-label="编辑团队休假" ${disabled}`,'quiet days-link')}</td><td colspan="3">These days off apply to the whole team</td></tr></tfoot></table>${draft.capacities.length?'':'<p class="muted">本迭代还没有容量成员，点击 Add user 添加。</p>'}</div>`;
  }
  function draw(){ $('.capacity-sheet').outerHTML=table();controls(); }
  function view(result){
    data=result;path=`/projects/${state.project}/planning?team_id=${result.team.id}&iteration_id=${result.iteration.id}`;
    const members=result.capacity_configured?result.capacities.filter(m=>m.has_capacity):result.capacities;
    draft={capacities:members.map(m=>({user_id:m.id,per_day:m.per_day,activity:m.activity,days_off:[...m.days_off]})),team_days_off:[...result.team_days_off]};initial=fingerprint();
    return `<form id="capacity-form" class="ado-capacity"><div class="capacity-command"><p>${icon('sprint')} 工作日：${data.working_days.map(i=>['日','一','二','三','四','五','六'][i]).join('、')}</p><div>${button('capacity-add',icon('plus')+'<span>Add user</span>',`${!writable()||members.length===result.capacities.length?'disabled':''} title="添加项目成员到本迭代容量"`,'primary')}<button type="submit" class="button" data-capacity-save disabled>${icon('save')}<span>Save</span></button>${button('capacity-revert',icon('undo')+'<span>Revert</span>','disabled','')}</div></div>${table()}<details class="capacity-summary"><summary>查看工作量与容量</summary><table><thead><tr><th>成员</th><th>剩余容量</th><th>剩余工作量</th></tr></thead><tbody>${result.capacities.map(m=>`<tr><td>${person(m)}</td><td>${m.remaining_capacity} h</td><td>${m.remaining_work} h${m.remaining_work>m.remaining_capacity?' · 超出容量':''}</td></tr>`).join('')}</tbody></table><p>以上为上次保存后的计算结果，保存修改后更新。</p></details></form>`;
  }
  async function save(){
    if(!writable()||!dirty())return;
    const control=$('[data-capacity-save]');control.disabled=true;
    try{await api(path,{method:'PUT',body:structuredClone(draft)});initial=fingerprint();toast('容量已保存');await render();}
    catch(error){toast(error.message);controls();}
  }
  const oldHandle=handle;
  handle=async(action,element)=>{
    if(!action.startsWith('capacity-'))return oldHandle(action,element);
    if(!writable()||!active())return;
    if(action==='capacity-revert'){draft=JSON.parse(initial);draw();return;}
    if(action==='capacity-remove'){draft.capacities=draft.capacities.filter(m=>m.user_id!==Number(element.dataset.id));draw();return;}
    if(action==='capacity-add'){
      const available=data.capacities.filter(m=>!draft.capacities.some(c=>c.user_id===m.id));if(!available.length)return;
      modal('Add user',field('项目成员',select('capacity_user',available.map(m=>option(m.id,m.name,'')).join(''))),async form=>{draft.capacities.push({user_id:Number(form.elements.capacity_user.value),per_day:0,activity:'',days_off:[]});closeDialog(true);draw();},'添加到容量');return;
    }
    if(action==='capacity-days'){
      const id=Number(element.dataset.id),member=draft.capacities.find(m=>m.user_id===id),dates=id?member.days_off:draft.team_days_off;
      const start=Date.parse(data.iteration.start_date+'T00:00:00Z'),end=Date.parse(data.iteration.end_date+'T00:00:00Z');
      const days=[];for(let timestamp=start;timestamp<=end;timestamp+=86400000)days.push(new Date(timestamp).toISOString().slice(0,10));
      modal(id?'个人休假':'团队休假',`<p>${esc(data.iteration.start_date)} — ${esc(data.iteration.end_date)}</p><p class="hint">选择休假日期。非工作日不重复扣除容量，团队与个人重叠休假仅扣除一次。</p><div class="capacity-calendar">${days.map(d=>`<label class="check"><input type="checkbox" name="days" value="${d}" ${dates.includes(d)?'checked':''}><span>${d} · 周${['日','一','二','三','四','五','六'][new Date(d+'T00:00:00Z').getUTCDay()]}</span></label>`).join('')}</div>`,async form=>{const chosen=new FormData(form).getAll('days');if(id)member.days_off=chosen;else draft.team_days_off=chosen;closeDialog(true);draw();},'应用到容量草稿');return;
    }
  };
  document.addEventListener('input',event=>{
    if(!event.target.closest('#capacity-form'))return;
    const match=event.target.name.match(/^(per_day|activity)-(\d+)$/);if(!match)return;
    const member=draft.capacities.find(m=>m.user_id===Number(match[2]));member[match[1]]=match[1]==='per_day'?Number(event.target.value):event.target.value;controls();
  });
  document.addEventListener('change',event=>{if(event.target.matches('#capacity-form select'))event.target.dispatchEvent(new Event('input',{bubbles:true}));});
  document.addEventListener('click',event=>{
    if(!dirty()||dialog.open)return;const control=event.target.closest('a[href^="#"],button[data-action]');
    if(!control||control.closest('#capacity-form,.reference-capacity-actions')||['toggle-navigation','boards-navigation','dismiss-notice'].includes(control.dataset.action))return;
    if(!confirm('容量有尚未保存的修改，确定放弃吗？')){event.preventDefault();event.stopImmediatePropagation();}else initial=fingerprint();
  },true);
  document.addEventListener('change',event=>{
    if(!dirty()||dialog.open||event.target.closest('#capacity-form')||!event.target.matches('select[data-filter],select[name=project]'))return;
    if(!confirm('容量有尚未保存的修改，确定放弃吗？')){
      event.target.value=event.target.name==='project'?String(state.project):state.filters[event.target.name]||'';
      event.preventDefault();event.stopImmediatePropagation();
    }else initial=fingerprint();
  },true);
  window.addEventListener('hashchange',event=>{
    if(!dirty()||dialog.open)return;
    if(!confirm('容量有尚未保存的修改，确定放弃吗？')){history.replaceState(null,'',state.currentHash||'#');event.stopImmediatePropagation();}
    else initial=fingerprint();
  },true);
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  return {render:view,save,syncControls:controls};
})();
