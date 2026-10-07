import test from 'node:test';
import assert from 'node:assert/strict';
import {start,client} from './helpers.mjs';

test('Weekly iterations and atomic hierarchy scheduling',async t=>{
  const server=await start({env:process.env.DEVOPS_TEST_MYSQL?{DEVOPS_DB_PROVIDER:'mysql',DEVOPS_MYSQL_CONNECTION_STRING:process.env.DEVOPS_TEST_MYSQL}:{}});t.after(()=>server.stop());
  const admin=client(server.base),reader=client(server.base),password='Weekly-test-password-2026';
  await admin.request('/setup','POST',{name:'Admin',login:'admin',password});const base='/projects/1';
  const user=await admin.request('/users','POST',{name:'Reader',login:'reader',password});await admin.request(base+'/members','POST',{user_id:user.id,role:'reader'});await reader.request('/login','POST',{login:'reader',password});
  const body={prefix:'Weekly',start_date:'2026-12-27',count:3,first_number:1};let weeks;
  await t.test('seven-day ranges cross the year boundary; repeated creation reuses records',async()=>{
    await reader.request(base+'/weekly-iterations','POST',body,{status:403});
    await admin.request(base+'/weekly-iterations','POST',{...body,count:27},{status:400});
    await admin.request(base+'/weekly-iterations','POST',{...body,start_date:'2026-02-30'},{status:400});
    const result=await admin.request(base+'/weekly-iterations','POST',body);weeks=result.iterations;assert.equal(result.created,3);assert.equal(weeks[0].end_date,'2027-01-02');assert.equal(weeks[1].start_date,'2027-01-03');
    const again=await admin.request(base+'/weekly-iterations','POST',body);assert.equal(again.created,0);assert.equal(again.reused,3);
    const conflict=await admin.request(base+'/iterations','POST',{name:'Clash Wk02 (01/03 - 01/09)',start_date:'2027-01-01',end_date:'2027-01-09'});
    await admin.request(base+'/weekly-iterations','POST',{...body,prefix:'Clash'},{status:409});
    assert.equal((await admin.request(base)).iterations.filter(i=>i.name.startsWith('Clash')).length,1);assert.ok(conflict.id);
  });
  const root=await admin.request(base+'/items','POST',{title:'Requirement',type:'Product Backlog Item',iteration_id:weeks[0].id});
  let task=await admin.request(base+'/items','POST',{title:'Child',type:'Task',parent_id:root.id,remaining_work:7,iteration_id:weeks[0].id});
  const done=await admin.request(base+'/items','POST',{title:'Nested done',type:'Task',parent_id:task.id,state:'Done',iteration_id:weeks[0].id});
  const deleted=await admin.request(base+'/items','POST',{title:'Deleted child',type:'Task',parent_id:root.id,iteration_id:weeks[0].id});await admin.request(`/items/${deleted.id}`,'DELETE',{version:deleted.version});
  const move={item_id:root.id,iteration_id:weeks[1].id,include_children:true};
  const preview=()=>admin.request(base+'/schedule-preview','POST',move);
  await t.test('preview is read-only; descendant conflicts roll back the entire move',async()=>{
    const plan=await preview();assert.equal(plan.items.length,3);assert.equal((await admin.request(`/items/${root.id}`)).item.iteration_id,weeks[0].id);
    await reader.request(base+'/schedule-preview','POST',move,{status:403});
    task=await admin.request(`/items/${task.id}`,'PATCH',{version:task.version,remaining_work:5});
    await admin.request(base+'/schedule','POST',{...move,items:plan.items},{status:409});assert.equal((await admin.request(`/items/${root.id}`)).item.iteration_id,weeks[0].id);
    const valid=await preview();await admin.request(base+'/schedule','POST',{...move,items:valid.items});
    for(const id of [root.id,task.id,done.id])assert.equal((await admin.request(`/items/${id}`)).item.iteration_id,weeks[1].id);
    assert.equal((await admin.request(`/items/${task.id}`)).item.remaining_work,5);assert.equal((await admin.request(`/items/${done.id}`)).item.state,'Done');assert.equal((await admin.request(`/items/${deleted.id}`)).item.iteration_id,weeks[0].id);
  });
  await t.test('new children invalidate the preview; unassignment and project boundaries are checked',async()=>{
    const plan=await preview();await admin.request(base+'/items','POST',{title:'New child',type:'Bug',parent_id:root.id});
    await admin.request(base+'/schedule','POST',{...move,items:plan.items},{status:409});
    const other=await admin.request('/projects','POST',{name:'Other'});const otherSprint=await admin.request(`/projects/${other.id}/iterations`,'POST',{name:'Other sprint',start_date:'2027-01-01',end_date:'2027-01-07'});
    await admin.request(base+'/schedule-preview','POST',{...move,iteration_id:otherSprint.id},{status:400});
    await admin.request(`/projects/${other.id}/schedule-preview`,'POST',{...move,iteration_id:null},{status:404});
    const single={...move,include_children:false,iteration_id:null};const one=await admin.request(base+'/schedule-preview','POST',single);assert.equal(one.items.length,1);
    await admin.request(base+'/schedule','POST',{...single,items:one.items});assert.equal((await admin.request(`/items/${root.id}`)).item.iteration_id,null);assert.equal((await admin.request(`/items/${task.id}`)).item.iteration_id,weeks[1].id);
  });
});
