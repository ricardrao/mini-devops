// Adds a coherent demo without resetting existing work. Run with an admin login.
import {randomBytes} from 'node:crypto';
const origin=process.env.DEVOPS_BASE_URL || 'http://localhost:3220';
const project=Number(process.env.DEVOPS_SEED_PROJECT_ID || 1), base=`/projects/${project}`;
if(!process.env.DEVOPS_SEED_LOGIN || !process.env.DEVOPS_SEED_PASSWORD) throw Error('Set DEVOPS_SEED_LOGIN and DEVOPS_SEED_PASSWORD.');
let cookie='',csrf='';
async function api(path,method='GET',body){
  const response=await fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return data;
}
const me=await api('/login','POST',{login:process.env.DEVOPS_SEED_LOGIN,password:process.env.DEVOPS_SEED_PASSWORD});
let meta=await api(base);
const allUsers=await api('/users'), members=[me.user.id];
let usersCreated=0,created=0,reused=0;
for(const [login,name] of [['demo_linxiao','林晓 · 产品演示'],['demo_chenyu','陈宇 · 开发演示'],['demo_wangmin','王敏 · 测试演示']]){
  let user=allUsers.find(u=>u.login===login);
  if(user && user.name!==name)throw Error(`Existing login ${login} is not a demo account; choose another prefix.`);
  if(!user){user=await api('/users','POST',{login,name,password:randomBytes(32).toString('base64url')});usersCreated++;}
  if(!meta.members.some(m=>m.id===user.id))await api(base+'/members','POST',{user_id:user.id,role:'editor'});
  members.push(user.id);
}
const today=new Date().toISOString().slice(0,10);
const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
async function iteration(name,start_date,end_date){return meta.iterations.find(i=>i.name===name) || {...await api(base+'/iterations','POST',{name,start_date,end_date}),name,start_date,end_date};}
const current=meta.iterations.find(i=>i.start_date<=today && i.end_date>=today) || await iteration('Demo Sprint 1 · 产品交付',today,shift(today,13));
const previous=await iteration('Demo Sprint 0 · 基础能力',shift(current.start_date,-14),shift(current.start_date,-1));
const next=await iteration('Demo Sprint 2 · 体验完善',shift(current.end_date,1),shift(current.end_date,14));
// Stable area prefix keeps reruns safe even after a project is renamed.
const area='Demo\\Nimbus';
let team=meta.teams.find(t=>t.name==='产品交付演示');
if(!team)team=await api(base+'/teams','POST',{name:'产品交付演示',areas:area,default_iteration_id:current.id,working_days:[1,2,3,4,5]});
const existing=[];
for(const view of ['all','recycle'])for(let offset=0;;offset+=500){
  const result=await api(base+`/items?view=${view}&include_completed=true&limit=500&offset=${offset}`);existing.push(...result.items);if(offset+result.items.length>=result.total)break;
}
const records=new Map(), fresh=new Set();
async function item(key,title,type,parent,extra={}){
  const marker='Demo:'+key;
  let result=existing.find(i=>i.tags.split(';').map(t=>t.trim()).includes(marker));
  if(result){reused++;records.set(key,result);return result;}
  const ancestor=parent?records.get(parent):null;
  if(ancestor?.deleted){reused++;return null;}
  result=await api(base+'/items','POST',{
    title,type,state:'New',parent_id:ancestor?.id || null,assignee_id:members[0],priority:2,
    area:area+'\\Experience',tags:`MiniDevOps-Demo; ${marker}; Nimbus v1.0`,
    description:`演示项目：Nimbus 团队协作控制台。\n目标：${title}。\n交付范围：实现主要流程，覆盖空数据、错误反馈与权限边界，并完成联调验收。`,
    acceptance:'1. 主要操作能够完成且刷新后数据保持。\n2. 加载、空数据及失败状态有明确反馈。\n3. 相关测试通过，验收结果已记录。',...extra
  });created++;fresh.add(key);records.set(key,result);return result;
}
await item('epic-experience','Nimbus v1.0：统一团队协作体验','Epic',null,{assignee_id:members[1],state:'Active'});
await item('epic-platform','Nimbus v1.0：可靠性与交付质量','Epic',null,{state:'Active',area:area+'\\Platform'});
for(const [key,title,parent] of [
  ['feature-work','工作项管理与协作','epic-experience'],['feature-plan','看板与迭代规划','epic-experience'],
  ['feature-platform','身份认证与服务可靠性','epic-platform'],['feature-quality','发布验证与质量保障','epic-platform']
])await item(key,title,'Feature',parent,{state:'Active',assignee_id:key==='feature-quality'?members[3]:members[0]});
const specs=[
  ['pbi-login','账号登录与会话管理','feature-platform','Done',previous, 'Platform'],
  ['pbi-edit','工作项创建、编辑与历史记录','feature-work','Active',current,'Experience'],
  ['pbi-search','按负责人、状态和标签组合筛选','feature-work','New',current,'Experience'],
  ['pbi-comments','评论、关注与附件协作','feature-work','Active',current,'Experience'],
  ['pbi-board','拖拽看板与泳道管理','feature-plan','Active',current,'Experience'],
  ['pbi-capacity','迭代容量与成员休假配置','feature-plan','New',current,'Experience'],
  ['pbi-release','v1.0 发布检查与回归测试','feature-quality','Active',current,'Quality'],
  ['pbi-auth','项目权限隔离与并发编辑保护','feature-platform','Active',current,'Platform'],
  ['pbi-notify','工作项变更通知与摘要','feature-work','New',next,'Platform'],
  ['pbi-report','交付趋势与迭代统计','feature-plan','New',next,'Experience']
];
const taskLabels={
  'pbi-login':['登录表单与错误提示','会话过期和退出验证'],
  'pbi-edit':['详情表单与字段校验','版本冲突提示与历史记录','编辑接口权限回归'],
  'pbi-search':['组合筛选与 URL 状态同步','空结果与清空筛选体验','筛选接口性能验证'],
  'pbi-comments':['评论编辑与文本安全','附件上传与访问权限'],
  'pbi-board':['卡片拖拽与顺序持久化','泳道与 WIP 上限提示','看板键盘操作验收'],
  'pbi-capacity':['工作日与个人休假计算','容量表单保存与冲突检查'],
  'pbi-release':['执行主流程回归用例','发布清单与回滚演练','整理版本说明'],
  'pbi-auth':['项目读取与写入权限检查','并发修改冲突测试'],
  'pbi-notify':['通知偏好设计','摘要发送接口设计'],
  'pbi-report':['统计指标口径确认','趋势图空状态设计']
};
let taskIndex=0;
for(const [key,title,parent,state,sprint,scope] of specs){
  await item(key,title,'Product Backlog Item',parent,{state,iteration_id:sprint.id,area:area+'\\'+scope,estimate:5+(taskLabels[key].length===3?3:0),target_date:sprint.end_date,assignee_id:key==='pbi-release'?members[3]:members[0]});
  for(const [j,label] of taskLabels[key].entries()){
    const done=sprint.id===previous.id || (sprint.id===current.id && taskIndex%5===0);
    const active=!done && sprint.id===current.id && taskIndex%3!==0;
    await item(`${key}-task-${j+1}`,label,'Task',key,{state:done?'Done':active?'In Progress':'To Do',iteration_id:sprint.id,area:area+'\\'+scope,
      assignee_id:members[taskIndex%4],original_estimate:8,remaining_work:done?0:active?4:8,completed_work:done?8:active?4:0,activity:scope==='Quality'?'Testing':'Development',
      blocked:key==='pbi-notify'&&j===1?1:0,reason:key==='pbi-notify'&&j===1?'等待通知通道接口方案确认':'',target_date:sprint.end_date});taskIndex++;
  }
}
const bugs=[
  ['筛选条件刷新后丢失','pbi-search','In Progress',1],['附件名包含中文时下载名称错误','pbi-comments','New',2],
  ['窄屏下工作项长标题挤压状态列','pbi-edit','In Review',2],['跨项目链接应返回无权限提示','pbi-auth','Done',1],
  ['休假跨周末时容量重复扣减','pbi-capacity','In Progress',1],['拖拽后快速刷新导致顺序回退','pbi-board','New',2],
  ['退出登录后浏览器后退仍显示旧数据','pbi-login','Done',2],['查询空结果缺少清空条件入口','pbi-search','New',3]
];
for(const [n,[title,parent,state,priority]] of bugs.entries())await item('bug-'+(n+1),title,'Bug',parent,{
  state,priority,severity:priority,iteration_id:current.id,area:area+'\\Quality',assignee_id:members[n%2===0?0:3],original_estimate:4,remaining_work:state==='Done'?0:3,completed_work:state==='Done'?4:1,activity:'Testing',
  repro_steps:`1. 登录 Nimbus 演示项目。\n2. 打开“${specs.find(s=>s[0]===parent)[1]}”相关页面。\n3. 执行标题描述的场景，观察结果。\n实际：${title}。\n期望：结果正确且有明确反馈。`,system_info:'演示环境：Windows 11 / Edge；使用项目示例数据复现。',
  blocked:n===4?1:0,reason:n===4?'等待容量计算修复完成后联合验证':'',target_date:n===4?shift(today,-1):current.end_date
});
let commentsCreated=0;
for(const key of ['epic-experience','pbi-edit','pbi-board','pbi-capacity','pbi-release','pbi-auth','bug-1','bug-5']){
  const record=records.get(key);if(!record || record.deleted)continue;
  const detail=await api(`/items/${record.id}`);const body=key==='bug-5'?'[演示记录] 已确认容量计算边界问题，等待修复后进行回归。':'[演示记录] 已完成需求拆分；请在子任务中维护剩余工时，完成验收后更新状态。';
  if(!detail.comments.some(c=>c.body===body)){await api(`/items/${record.id}/comments`,'POST',{body,version:detail.item.version});commentsCreated++;}
}
for(const [source,target] of [['pbi-auth','pbi-release'],['pbi-edit','pbi-search']]){
  const a=records.get(source),b=records.get(target);if(a?.deleted||b?.deleted||!a||!b)continue;
  const detail=await api(`/items/${a.id}`);
  if(!detail.links.some(l=>l.kind==='dependency' && l.source_id===a.id && l.target_id===b.id))await api(`/items/${a.id}/links`,'POST',{kind:'successor',target_id:b.id,version:detail.item.version});
}
const release=records.get('pbi-release');
if(release && !release.deleted){const detail=await api(`/items/${release.id}`);if(!detail.attachments.some(a=>a.name==='release-checklist.md'))await api(`/items/${release.id}/attachments`,'POST',{name:'release-checklist.md',content:Buffer.from('# Nimbus v1.0 发布验收（演示）\n\n- [x] 登录与权限隔离\n- [x] 工作项保存与历史\n- [ ] 看板拖拽回归\n- [ ] 容量边界验证\n- [ ] 数据备份与回滚演练\n').toString('base64')});}
const boardPath=base+`/board?team_id=${team.id}&level=backlog`;
let board=await api(boardPath);
if(board.version===0){const definition=structuredClone(board.definition);definition.lanes.push({id:'expedite',name:'紧急交付'});definition.columns.find(c=>c.id==='in-progress').limit=5;definition.columns.find(c=>c.id==='in-review').split=true;await api(boardPath,'PUT',{definition,version:board.version});board=await api(boardPath);}
const placements=['done','in-progress','approved','in-review','active','committed','in-review','resolved','new','new'];
for(const [n,spec] of specs.entries())if(fresh.has(spec[0])){const detail=await api(`/items/${records.get(spec[0]).id}`);await api(boardPath,'POST',{item_id:detail.item.id,version:detail.item.version,board_version:board.version,column_id:placements[n],lane_id:n===6?'expedite':'default',column_done:n===3?1:0});}
const planningPath=base+`/planning?team_id=${team.id}&iteration_id=${current.id}`;
const planning=await api(planningPath);
if(planning.capacities.every(c=>Number(c.per_day)===0))await api(planningPath,'PUT',{capacities:members.map((id,n)=>({user_id:id,per_day:n===1?4:6,activity:n===3?'Testing':'Development',days_off:[]})),team_days_off:[]});
meta=await api(base);
const folders=await api(base+'/query-folders');
if(!folders.some(f=>f.name==='演示查询' && f.shared===1))await api(base+'/query-folders','POST',{name:'演示查询',shared:1});
let queriesCreated=0;
for(const [name,rules] of [
  ['我的待办（演示）',[{field:'assignee_id',op:'=',value:'@Me'},{field:'state',op:'notIn',value:'Done;Removed'}]],
  ['当前迭代未完成',[{field:'iteration_id',op:'=',value:String(current.id)},{field:'state',op:'notIn',value:'Done;Removed'}]],
  ['高优先级 Bug',[{field:'type',op:'=',value:'Bug'},{field:'priority',op:'<=',value:'2'},{field:'state',op:'!=',value:'Done'}]],
  ['受阻工作项',[{field:'blocked',op:'=',value:'1'}]],
  ['产品需求清单',[{field:'type',op:'=',value:'Product Backlog Item'}]]
]){
  let query=meta.queries.find(q=>q.name===name && q.folder==='演示查询');
  if(!query){query=await api(base+'/queries','POST',{name,folder:'演示查询',shared:1,filters:JSON.stringify({view:'all',include_completed:'true',clauses:{group:'AND',rules:[{field:'area',op:'under',value:area},...rules]}})});queriesCreated++;}
  if(name==='我的待办（演示）'||name==='当前迭代未完成')await api(base+`/queries/${query.id}/favorite`,'POST',{favorite:1});
}
console.log(JSON.stringify({project,created,reused,usersCreated,commentsCreated,queriesCreated,team:team.id,currentIteration:current.id,summary:(await api(base+'/summary')).stats},null,2));
