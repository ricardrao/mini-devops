'use strict';
// Shared page layouts checked against the original Boards pages, not screenshots alone.
window.ReferenceUI = (() => {
  const icon = AzureUI.icon;
  const command = (action,glyph,label,extra='',css='quiet') => button(action,icon(glyph)+`<span>${label}</span>`,extra,css);
  const node = (className,html='') => Object.assign(document.createElement('div'),{className,innerHTML:html});
  const glyphButton = (element,glyph,label) => {if(element)element.innerHTML=icon(glyph)+`<span>${label}</span>`;};
  function teamPages() {
    const page=state.page,content=$('#page-content');if(!['board','backlog'].includes(page)||$('.reference-team-header',content))return;
    const team=$('.team-toolbar',content),tabs=$('.ado-tabs',content);if(!team||!tabs)return;
    const header=node('reference-team-header');content.prepend(header);header.append(team);
    const navigation=node('reference-team-navigation');header.append(navigation);navigation.append(tabs);
    const tools=node('reference-view-tools');navigation.append(tools);
    tools.append($('[name="level"]',team));
    const teamIcon=$(':scope > div > .ui-icon',team);if(teamIcon)teamIcon.outerHTML=icon(page==='board'?'board':'list');
    const view=$(`[data-action="${page==='board'?'view-backlog':'view-board'}"]`,team);
    glyphButton(view,'arrow',page==='board'?'View as backlog':'View as Board');
    if(page==='board') {
      const settings=$('[data-action="board-settings"]',team);
      tools.insertAdjacentHTML('beforeend',command('reference-board-filter','filter','','aria-label="Filter work items" title="Filter work items"'));
      if(settings){glyphButton(settings,'settings','');settings.title='Board settings';settings.setAttribute('aria-label','Board settings');tools.append(settings);}
      const filter=$('#filters',content);if(!filter)return;header.append(filter);
      filter.hidden=!pref('board-filter-visible',false)&&!['q','assignee_id','tag','state'].some(k=>state.filters[k]);
      $('.search-icon',filter).innerHTML=icon('filter');
    } else {
      const actions=$('.commands',team);
      if(writable())actions.insertAdjacentHTML('afterbegin',command('new-item','plus','New Work Item','','primary'));
      actions.insertAdjacentHTML('beforeend',command('reference-backlog-columns','columns','Column Options'));
      const first=$('.backlog-table thead th',content);
      if(first){const controls=node('backlog-tree-controls');for(const action of ['expand-backlog','collapse-backlog']){const b=$(`[data-action="${action}"]`,team);if(b){b.innerHTML=icon(action==='expand-backlog'?'plus':'minus');b.setAttribute('aria-label',action==='expand-backlog'?'Expand all':'Collapse all');controls.append(b);}}first.prepend(controls);}
      tools.insertAdjacentHTML('beforeend',command('reference-backlog-options','sliders','','aria-label="Backlog view options" title="Backlog view options"'));
      const options=$('.backlog-options',content);if(!options)return;header.append(options);options.hidden=true;
      options.insertAdjacentHTML('beforeend',`<label class="check"><input type="checkbox" data-planning-visible ${pref('backlog-planning-visible',false)?'checked':''}> Planning</label>`);
      $('.backlog-layout',content)?.classList.toggle('planning-hidden',!pref('backlog-planning-visible',false));
      const cols=['order','type','title','state','estimate','iteration','actions'];
      const visible=pref('backlog-columns',['type','state','estimate','iteration']);
      for(const row of content.querySelectorAll('.backlog-table tr'))[...row.children].forEach((cell,i)=>{cell.dataset.column=cols[i];if(['type','state','estimate','iteration'].includes(cols[i]))cell.hidden=!visible.includes(cols[i]);});
      for(const row of content.querySelectorAll('.backlog-table tbody tr')) {
        const id=Number(row.dataset.reorder),item=state.items.find(i=>i.id===id),title=$('.item-title',row);if(!item||!title)continue;
        $('[data-column="type"]',row).textContent=item.type;
        title.innerHTML=AzureUI.typeIcon(item.type)+`<span>${esc(item.title)}</span>`;
      }
    }
  }
  function capacity() {
    if(state.page!=='sprints'||!$('#capacity-form')||$('.reference-capacity-actions'))return;
    const commands=$('.sprint-header .team-toolbar .commands'),actions=$('.capacity-command>div');
    if(commands&&actions){commands.replaceChildren();actions.classList.add('reference-capacity-actions');commands.append(actions);$('[data-capacity-save]',actions).setAttribute('form','capacity-form');}
    const workdays=$('.capacity-command>p'),summary=$('.capacity-summary');
    if(workdays&&summary)summary.append(workdays);
    $('.capacity-command')?.remove();
  }
  const queryExpanded=new Map();
  function queryModified(record) {
    if(!record?.changed || !record.changed_by_name)return '<span class="query-history-unknown" title="No modification history was recorded for this entry">\u672a\u8bb0\u5f55</span>';
    return avatar(record.changed_by_name)+'<span>'+esc(record.changed_by_name)+' <span class="query-modified-date">updated '+esc(new Date(record.changed).toLocaleDateString())+'</span></span>';
  }
  function queryRows(folders, search='') {
    const favorites=state.filters.favorites==='true';
    const items=state.meta.queries.filter(q=>(!favorites||q.favorite)&&(!search||String(q.name+' '+q.folder).toLowerCase().includes(search.toLowerCase())));
    const query=(q,depth)=>{
      const editable=q.user_id===state.user.id||state.user.admin&&q.shared;
      return '<div class="reference-query-row query-depth-'+Math.min(depth,5)+'" role="treeitem"><div class="reference-query-name">'+icon('query')+button('edit-query',esc(q.name),'data-id="'+q.id+'"','quiet query-title-link')+button('favorite-query',q.favorite?'\u2605':'\u2606','data-id="'+q.id+'" aria-label="Favorite query" aria-pressed="'+!!q.favorite+'"','quiet favorite')+'</div><div class="reference-query-owner">'+queryModified(q)+'<details class="overflow-menu query-row-menu"><summary aria-label="Query actions">'+icon('more')+'</summary><div>'+command('run-saved-query','arrow','Run query','data-id="'+q.id+'"')+command('edit-query','query','Edit','data-id="'+q.id+'"')+(editable?command('reference-edit-query','list','Rename / Move','data-id="'+q.id+'"')+command('delete-query','trash','Delete','data-id="'+q.id+'"'):'')+'</div></details></div></div>';
    };
    const roots=[0,1].map(shared=>{
      const matches=items.filter(q=>q.shared===shared), root={path:'',name:shared?'Shared Queries':'My Queries',children:new Map()};
      const ensure=path=>{let n=root,full='';for(const name of path.split('/').filter(Boolean)){full+=(full?'/':'')+name;if(!n.children.has(name))n.children.set(name,{path:full,name,children:new Map()});n=n.children.get(name);}return n;};
      for(const f of folders.filter(f=>f.shared===shared))if(!search||matches.some(q=>q.folder===f.name||q.folder.startsWith(f.name+'/')))ensure(f.name).record=f;
      for(const q of matches)ensure(q.folder);
      function branch(n,depth){
        const key=state.project+':'+shared+':'+n.path,children=[...n.children.values()].sort((a,b)=>a.name.localeCompare(b.name));
        const rows=matches.filter(q=>q.folder===n.path), open=!!search||(queryExpanded.get(key)??depth===0);
        return '<details class="'+(depth?'reference-query-folder':'reference-query-root')+'" data-query-folder-key="'+esc(key)+'" '+(open?'open':'')+'><summary class="reference-query-row query-depth-'+Math.min(depth,5)+'"><div class="reference-query-name">'+icon('chevron')+icon('folder')+'<span>'+esc(n.name)+'</span></div><div class="reference-query-owner">'+(depth?queryModified(n.record):'')+'</div></summary>'+rows.map(q=>query(q,depth+1)).join('')+children.map(c=>branch(c,depth+1)).join('')+'</details>';
      }
      return branch(root,0);
    }).join('');
    return roots+(search&&!items.length?'<p class="reference-query-empty">No matching queries.</p>':'');
  }
  let queryFolders=[];
  function queries(folders) {
    queryFolders=folders;const favorites=state.filters.favorites==='true';
    $('#page-content').innerHTML=`<div class="reference-query-header"><div class="reference-query-heading"><h1>Queries</h1><div class="query-commandbar">${command('new-query','plus','New query','','primary')}${command('new-query-folder','folder','New folder')}${writable()?command('import-items','upload','Import work items'):''}</div></div><div class="reference-query-navigation"><div class="ado-tabs">${button('query-favorites','Favorites','data-value="true"',favorites?'selected':'quiet')}${button('query-favorites','All','data-value="false"',!favorites?'selected':'quiet')}</div><label class="reference-query-search">${icon('filter')}<input data-query-search placeholder="Filter by keywords" aria-label="Filter queries">${command('reference-clear-query-filter','close','','aria-label="Clear query filter"')}</label></div></div><div class="reference-query-table"><div class="reference-query-tablehead"><span>Title</span><span>Last modified by</span></div><div class="reference-query-tree" role="tree">${queryRows(folders)}</div></div>`;
  }
  function queryEditor() {
    if(state.page!=='queries'||!$('.query-editor-heading'))return;
    glyphButton($('[data-action="run-query"]'),'arrow','Run query');glyphButton($('[data-action="save-editor-query"]'),'save','Save');
  }
  const previous=MiniBoards.renderPage;
  MiniBoards.renderPage=async sequence=>{const handled=await previous(sequence);if(handled&&sequence===state.sequence){teamPages();capacity();queryEditor();}return handled;};
  const oldHandle=handle;
  handle=async(action,element)=>{
    if(action==='reference-edit-query') {
      const q=state.meta.queries.find(q=>q.id===Number(element.dataset.id));if(!q)return;
      modal('Rename / Move query',field('Name',input('name',q.name,'required maxlength="100"'))+field('Location',select('shared',option(0,'My Queries',q.shared)+(writable()?option(1,'Shared Queries',q.shared):'')))+field('Folder',select('folder',option('','Root',q.folder)+queryFolders.filter(f=>f.shared===q.shared).map(f=>option(f.name,f.name,q.folder)).join(''))),async form=>{
        const data=Object.fromEntries(new FormData(form));data.shared=Number(data.shared);data.filters=q.filters;data.version=q.version;
        await api(`/projects/${state.project}/queries/${q.id}`,{method:'PATCH',body:data});closeDialog(true);await render();
      });return;
    }
    if(action==='reference-board-filter'){const f=$('#filters');if(!f)return;f.hidden=!f.hidden;savePref('board-filter-visible',!f.hidden);element.setAttribute('aria-expanded',String(!f.hidden));if(!f.hidden)$('input',f)?.focus();return;}
    if(action==='reference-backlog-options'){const options=$('.backlog-options');if(options)options.hidden=!options.hidden;return;}
    if(action==='reference-backlog-columns') {
      const values={type:'Work Item Type',state:'State',estimate:'Effort',iteration:'Iteration Path'},chosen=pref('backlog-columns',Object.keys(values));
      modal('Column Options',Object.entries(values).map(([key,label])=>`<label class="check"><input type="checkbox" name="column" value="${key}" ${chosen.includes(key)?'checked':''}>${label}</label>`).join(''),async form=>{savePref('backlog-columns',new FormData(form).getAll('column'));closeDialog(true);await render();});return;
    }
    if(action==='reference-clear-query-filter'){const input=$('[data-query-search]');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return;}
    await oldHandle(action,element);queryEditor();
  };
  document.addEventListener('input',event=>{if(event.target.matches('[data-query-search]'))$('.reference-query-tree').innerHTML=queryRows(queryFolders,event.target.value.trim());});
  document.addEventListener('toggle',event=>{if(event.target.matches('[data-query-folder-key]')&&!$('[data-query-search]')?.value)queryExpanded.set(event.target.dataset.queryFolderKey,event.target.open);},true);
  document.addEventListener('change',event=>{if(event.target.matches('[data-planning-visible]')){savePref('backlog-planning-visible',event.target.checked);$('.backlog-layout').classList.toggle('planning-hidden',!event.target.checked);}});
  return {queries};
})();
