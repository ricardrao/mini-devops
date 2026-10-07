'use strict';
window.WeeklyPlanning = (() => {
  const day = value => Date.parse(value + 'T00:00:00Z');
  const today = () => new Date().toISOString().slice(0,10);
  const shift = (value, days) => new Date(day(value) + days * 86400000).toISOString().slice(0,10);
  const weekly = i => day(i.end_date) - day(i.start_date) === 6 * 86400000;
  const ordered = () => [...state.meta.iterations].sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.id-b.id);
  const phase = i => i.end_date < today() ? '过去' : i.start_date > today() ? '未来' : '当前';
  const current = () => ordered().filter(i=>phase(i)==='当前').sort((a,b)=>(day(a.end_date)-day(a.start_date))-(day(b.end_date)-day(b.start_date))||b.id-a.id)[0];
  function pick(team) {
    return state.meta.iterations.find(i=>String(i.id)===state.filters.iteration_id) || state.meta.iterations.find(i=>i.id===team.default_iteration_id) || current() || ordered().find(i=>i.start_date>today()) || ordered().at(-1);
  }
  function options(selected) {
    return ['当前','未来','过去'].map(group=>`<optgroup label="${group}">${ordered().filter(i=>phase(i)===group).map(i=>option(i.id,`${i.name} · ${phase(i)}`,selected)).join('')}</optgroup>`).join('');
  }
  function navigation(iteration) {
    const sequence=ordered().filter(i=>!weekly(iteration)||weekly(i));const index=sequence.findIndex(i=>i.id===iteration.id);
    const now=current();const previous=weekly(iteration)?sequence.find(i=>i.start_date===shift(iteration.start_date,-7)):sequence[index-1],next=weekly(iteration)?sequence.find(i=>i.start_date===shift(iteration.start_date,7)):sequence[index+1];
    const jump=(i,label)=>button('jump-iteration',label,i?`data-id="${i.id}"`:'disabled','quiet');
    const weeks=ordered().filter(weekly);let anchor=weeks.findIndex(i=>i.id===iteration.id);if(anchor<0)anchor=Math.max(0,weeks.findIndex(i=>phase(i)==='当前'));
    return `<div class="week-navigation">${jump(previous,weekly(iteration)?'← 上周':'← 上一迭代')}${jump(now,now&&weekly(now)?'本周':'当前迭代')}${jump(next,weekly(iteration)?'下周 →':'下一迭代 →')}<span>${weekly(iteration)?'每周一个迭代':'当前为自定义周期'} · ${phase(iteration)} · 日期按 UTC 判断</span></div>${weeks.length?`<nav class="weekly-strip" aria-label="按周迭代">${weeks.slice(Math.max(0,anchor-2),Math.max(0,anchor-2)+7).map(i=>`<button type="button" data-action="jump-iteration" data-id="${i.id}" class="week-card ${i.id===iteration.id?'selected':''}" aria-current="${i.id===iteration.id?'date':'false'}"><b>${esc(i.name)}</b><span>${i.start_date} — ${i.end_date}</span><small>${phase(i)}</small></button>`).join('')}</nav>`:''}`;
  }
  async function schedule(itemId,targetId) {
    const base=`/projects/${state.project}`;let preview, ticket=0;
    const load=async()=>{
      const thisTicket=++ticket;preview=null;
      const form=$('#modal-form');$('button[type=submit]',form).disabled=true;
      const destination=Number(form.elements.iteration_id.value)||null, include=form.elements.include_children.checked;
      const result=await api(base+'/schedule-preview',{method:'POST',body:{item_id:itemId,iteration_id:destination,include_children:include}});
      if(!form.isConnected || thisTicket!==ticket)return;
      preview={...result,include_children:include};
      $('.schedule-preview',form).innerHTML=`<p>将安排 ${result.items.length} 个工作项；状态、负责人和工时保持不变。</p><div class="schedule-items">${result.items.map(i=>`<p>#${i.id} ${esc(i.title)} <small>${esc(i.state)}</small></p>`).join('')}</div>`;
      $('button[type=submit]',form).disabled=false;
    };
    modal('安排工作到迭代',field('目标迭代',select('iteration_id',option('','未安排',targetId)+options(targetId)))+'<label class="check"><input name="include_children" type="checkbox" checked> 同时安排所有子工作项（包含已完成项）</label><div class="schedule-preview" aria-live="polite"></div>',async form=>{
      if(!preview)throw Error('请等待预览完成');
      const result=await api(base+'/schedule',{method:'POST',body:{item_id:itemId,iteration_id:preview.iteration_id,include_children:preview.include_children,items:preview.items.map(i=>({id:i.id,version:i.version}))}});
      closeDialog(true);await render();toast(`已安排 ${result.changed} 个工作项`);
    },'确认安排');
    const form=$('#modal-form');
    form.addEventListener('change',()=>{load().catch(e=>{if(form.isConnected)$('.form-error',form).textContent=e.message;});});
    await load();
  }
  function createWeeks() {
    const date=today(),start=shift(date,-new Date(day(date)).getUTCDay());
    modal('连续创建周迭代',field('名称前缀',input('prefix','Weekly','required maxlength="50"'))+'<div class="two-fields">'+field('第一周开始日期',input('start_date',start,'type="date" required'))+field('周数',input('count',6,'type="number" min="1" max="26" required'))+'</div>'+field('起始周编号',input('first_number',1,'type="number" min="1" max="999" required'))+'<p class="hint">每周连续 7 天。可从周日或周一开始；周编号用于命名，不是年度 ISO 周数。同名且日期一致的迭代会复用。</p><div class="week-preview" aria-live="polite"></div>',async form=>{
      const values=Object.fromEntries(new FormData(form));values.count=Number(values.count);values.first_number=Number(values.first_number);
      const result=await api(`/projects/${state.project}/weekly-iterations`,{method:'POST',body:values});
      closeDialog(true);toast(`新建 ${result.created} 周，复用 ${result.reused} 周`);
      const active=result.iterations.find(i=>i.start_date<=today()&&i.end_date>=today())||result.iterations[0];
      go('sprints',{team_id:MiniBoards.selectedTeam().id,iteration_id:String(active.id)});
    },'创建周迭代');
    const preview=()=>{const form=$('#modal-form'),v=Object.fromEntries(new FormData(form)),count=Number(v.count),first=Number(v.first_number);const target=$('.week-preview',form);
      if(!v.start_date||!Number.isFinite(day(v.start_date))||count<1||count>26||!Number.isInteger(count)||first<1||!Number.isInteger(first)){target.textContent='请填写有效的日期、周数与编号。';return;}
      target.innerHTML=Array.from({length:count},(_,n)=>{const from=shift(v.start_date,n*7),to=shift(from,6);return `<p><b>${esc(v.prefix)} Wk${String(first+n).padStart(2,'0')}</b><span>${from} — ${to}</span></p>`;}).join('');};
    $('#modal-form').addEventListener('input',preview);preview();
  }
  const oldHandle=handle;
  handle=async(action,element)=>{
    if(action==='new-weekly-iterations')return createWeeks();
    if(action==='jump-iteration')return go('sprints',{...state.filters,iteration_id:element.dataset.id});
    if(action==='schedule-item'){
      const selected=state.meta.iterations.find(i=>String(i.id)===state.filters.iteration_id);
      const next=ordered().find(i=>i.start_date>(selected?.end_date||today()) && (!selected||!weekly(selected)||weekly(i)));
      return schedule(Number(element.dataset.id),next?.id||selected?.id||null);
    }
    return oldHandle(action,element);
  };
  return {pick,options,navigation,schedule,phase};
})();
