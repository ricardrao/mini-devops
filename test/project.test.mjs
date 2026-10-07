import test from 'node:test';
import assert from 'node:assert/strict';
import {start,client} from './helpers.mjs';

test('Project management: summary, permission checks, stale edits and iteration protection',async t=>{
  const server=await start({env:process.env.DEVOPS_TEST_MYSQL?{DEVOPS_DB_PROVIDER:'mysql',DEVOPS_MYSQL_CONNECTION_STRING:process.env.DEVOPS_TEST_MYSQL}:{}});t.after(()=>server.stop());
  const admin=client(server.base),editor=client(server.base),reader=client(server.base);const password='Project-test-password-2026';
  const me=await admin.request('/setup','POST',{name:'Admin',login:'admin',password});const project=(await admin.request('/projects'))[0].id,base=`/projects/${project}`;
  for(const [login,role,agent] of [['editor','editor',editor],['reader','reader',reader]]){const user=await admin.request('/users','POST',{name:login,login,password});await admin.request(base+'/members','POST',{user_id:user.id,role});await agent.request('/login','POST',{login,password});}
  let meta=await admin.request(base);
  await t.test('project edits are admin-only and reject stale form values',async()=>{
    const change={name:'Updated project',description:'Team delivery',expected:meta.project};
    await editor.request(base,'PATCH',change,{status:403});await reader.request(base,'PATCH',change,{status:403});
    await admin.request(base,'PATCH',{name:'Missing expectation'},{status:400});
    const updated=await admin.request(base,'PATCH',change);assert.equal(updated.name,'Updated project');
    await admin.request(base,'PATCH',change,{status:409});meta=await admin.request(base);assert.equal(meta.project.description,'Team delivery');
  });
  const sprint=await admin.request(base+'/iterations','POST',{name:'Current',start_date:'2026-10-01',end_date:'2026-10-14'});
  const task=await admin.request(base+'/items','POST',{title:'Blocked task',type:'Task',iteration_id:sprint.id,blocked:1,target_date:'2001-01-01',remaining_work:6.5});
  await admin.request(base+'/items','POST',{title:'Done',type:'Task',state:'Done',remaining_work:8});
  await admin.request(base+'/items','POST',{title:'Removed',type:'Task',state:'Removed'});
  const removed=await admin.request(base+'/items','POST',{title:'Deleted',type:'Task'});await admin.request(`/items/${removed.id}`,'DELETE',{version:removed.version});
  await t.test('summary excludes removed/deleted work and counts open workload',async()=>{
    const summary=await reader.request(base+'/summary');assert.deepEqual([summary.stats.total,summary.stats.open,summary.stats.completed,summary.stats.blocked,summary.stats.overdue],[2,1,1,1,1]);assert.equal(summary.stats.remaining_work,6.5);assert.equal(summary.iterations[0].total,1);
    const privateProject=await admin.request('/projects','POST',{name:'Private'});await reader.request(`/projects/${privateProject.id}/summary`,'GET',undefined,{status:404});
  });
  await t.test('iteration edits reject invalid dates, stale writes and excluded days off',async()=>{
    let old=(await admin.request(base)).iterations[0];const change={name:'Current revised',start_date:old.start_date,end_date:old.end_date,expected:old};
    await reader.request(base+`/iterations/${old.id}`,'PATCH',change,{status:403});
    await editor.request(base+`/iterations/${old.id}`,'PATCH',{...change,end_date:'2026-09-30'},{status:400});
    const updated=await editor.request(base+`/iterations/${old.id}`,'PATCH',change);assert.equal(updated.name,'Current revised');
    await editor.request(base+`/iterations/${old.id}`,'PATCH',change,{status:409});old=updated;
    await admin.request(base+`/planning?team_id=${meta.teams[0].id}&iteration_id=${old.id}`,'PUT',{capacities:[{user_id:me.user.id,per_day:6,activity:'Development',days_off:['2026-10-13']}],team_days_off:[]});
    await editor.request(base+`/iterations/${old.id}`,'PATCH',{...change,expected:old,end_date:'2026-10-10'},{status:409});
    assert.equal((await admin.request(base)).iterations[0].end_date,'2026-10-14');
    await editor.request(base+`/iterations/${old.id}`,'DELETE',{expected:old},{status:409});
    const detail=(await admin.request(`/items/${task.id}`)).item;await admin.request(`/items/${task.id}`,'DELETE',{version:detail.version});
    await editor.request(base+`/iterations/${old.id}`,'DELETE',{expected:old},{status:409});
  });
  await t.test('empty iteration deletion clears capacity and protects team defaults',async()=>{
    const empty=await admin.request(base+'/iterations','POST',{name:'Empty',start_date:'2026-11-01',end_date:'2026-11-14'});
    const old=(await admin.request(base)).iterations.find(i=>i.id===empty.id);
    const team=meta.teams[0];const teamBody={name:team.name,areas:'',working_days:[1,2,3,4,5],default_iteration_id:empty.id};
    await admin.request(base+`/teams/${team.id}`,'PATCH',teamBody);
    await editor.request(base+`/iterations/${empty.id}`,'DELETE',{expected:old},{status:409});
    await admin.request(base+`/teams/${team.id}`,'PATCH',{...teamBody,default_iteration_id:null});
    await admin.request(base+`/planning?team_id=${team.id}&iteration_id=${empty.id}`,'PUT',{capacities:[{user_id:me.user.id,per_day:6,activity:'Development',days_off:[]}],team_days_off:[]});
    await editor.request(base+`/iterations/${empty.id}`,'DELETE',{expected:old});
    assert.ok(!(await admin.request(base)).iterations.some(i=>i.id===empty.id));
  });
});
