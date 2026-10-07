import assert from 'node:assert/strict';
export async function globalSearchBrowser({evaluate,click,fill,submit,until,shot,command}){
 const target=await evaluate(`(async()=>{const title='搜索验证 Search target';const item=await api('/projects/'+state.project+'/items',{method:'POST',body:{title,type:'Task',state:'Done',assignee_id:null}});const p=await api('/projects',{method:'POST',body:{name:'Search private scope'}});await api('/projects/'+p.id+'/items',{method:'POST',body:{title,type:'Task'}});go('workitems',{view:'mine',state:'Active',assignee_id:state.user.id});return item.id;})()`);
 await until(()=>evaluate('!!document.querySelector("#global-search input") && state.filters.view==="mine" && !document.querySelector("#page-content .loading")'),'search from filtered view');
 assert.equal(await evaluate('!!document.querySelector("a[href*=marketplace]")'),false);
 await fill('#global-search input','  搜索验证  ');await evaluate('document.querySelector("#global-search input").focus()');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until(()=>evaluate(`state.filters.q==='搜索验证' && state.items.length===1 && state.items[0].id===${target}`),'Enter searches all current-project items, including completed/unassigned');
 assert.equal(await evaluate('state.filters.state'),undefined);assert.equal(await evaluate('state.filters.assignee_id'),undefined);
 await shot('global-search-results.png');
 await click(`[data-open="${target}"]`);await until(()=>evaluate(`dialog.open && state.detail.id===${target}`),'search result opens matching detail');await evaluate('closeDialog(true)');
 for(const page of ['board','sprints','queries','boards-directory']){
  await evaluate(`go('${page}',{})`);await until(()=>evaluate(`state.page==='${page}' && document.querySelector('.azure-shell')?.dataset.page==='${page}' && !!document.querySelector('#global-search') && !document.querySelector('#page-content .loading')`),page);
  await fill('#global-search input','#'+target);await submit('#global-search');
  await until(()=>evaluate(`state.page==='workitems' && document.querySelector('.azure-shell')?.dataset.page==='workitems' && !document.querySelector('#page-content .loading') && state.filters.q==='${target}' && state.items.length===1 && state.items[0].id===${target}`),'ID search from '+page);
 }
 await fill('#global-search input','search-no-match-92817');await submit('#global-search');await until(()=>evaluate('state.total===0 && state.filters.q==="search-no-match-92817"'),'empty search results');
 await fill('#global-search input','');await submit('#global-search');await until(()=>evaluate('state.total>0 && !state.filters.q'),'clear search');
 await evaluate(`openItem(${target})`);await until(()=>evaluate('!!document.querySelector("#dialog [name=title]")'),'draft');await fill('#dialog [name=title]','Unsaved search draft');
 await evaluate('window.searchOriginalConfirm=window.confirm;window.confirm=()=>false');
 await fill('#global-search input','Search target');await submit('#global-search');assert.equal(await evaluate('dialog.open && state.dirty'),true);assert.equal(await evaluate('state.filters.q'),undefined);
 await evaluate('window.confirm=window.searchOriginalConfirm;closeDialog(true)');
}
