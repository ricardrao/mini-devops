'use strict';
window.TeamBoards = (() => {
  names['boards-directory'] = 'Boards';
  let entries = [], picker, trigger, query = '', directoryQuery = '';
  const folded = new Set(['all']);
  const base = () => `/projects/${state.project}`;
  const icon = name => AzureUI.icon(name);
  const href = id => `#/board?project=${state.project}&team_id=${id}&level=${encodeURIComponent(MiniBoards.level())}`;
  const star = row => button('team-board-favorite', icon('star'), `data-id="${row.id}" aria-label="${Number(row.favorite) ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${!!Number(row.favorite)}"`, 'quiet team-board-star');
  function groups(rows, directory = false) {
    const recent = rows.filter(r => r.last_visited).sort((a,b) => b.last_visited.localeCompare(a.last_visited)).slice(0,1);
    return [...(directory ? [['recent','Continue where you left off',recent]] : []), ['favorites','My favorite boards',rows.filter(r=>Number(r.favorite))], ['mine','My team boards',rows.filter(r=>Number(r.is_member))], ['all','All team boards',directory ? rows : rows.filter(r=>!Number(r.is_member))]];
  }
  function matching(text) { return entries.filter(r=>r.name.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase())); }
  function list() {
    const rows=matching(query), current=Number(state.filters.team_id);
    return groups(rows).filter(([, ,items])=>items.length).map(([key,label,items])=>`<div role="group" aria-labelledby="team-group-${key}"><h3 id="team-group-${key}">${label}</h3>${items.map(r=>`<div class="team-board-option"><a role="option" aria-selected="${r.id===current}" href="${href(r.id)}" data-team-option="${r.id}"><span class="team-board-check">${r.id===current?icon('check'):''}</span>${icon('boardsNav')}<span>${esc(r.name)}</span></a>${star(r)}</div>`).join('')}</div>`).join('') || '<p class="team-board-empty" role="status">No team boards found</p>';
  }
  function close(focus = false) {
    picker?.remove();picker=null;
    trigger?.setAttribute('aria-expanded','false');
    if(focus&&trigger?.isConnected)trigger.focus();
  }
  async function open(button) {
    if(picker){close(true);return;}
    trigger=button;query='';button.setAttribute('aria-expanded','true');
    picker=document.createElement('div');picker.className='team-board-menu';picker.id='team-board-menu';picker.setAttribute('role','dialog');picker.setAttribute('aria-label','Choose team board');
    picker.innerHTML=`<label class="team-board-search">${icon('search')}<input type="search" placeholder="Search team boards" aria-label="Search team boards" autocomplete="off"></label><div class="team-board-options" role="listbox" aria-label="Team boards">${list()}</div><a class="team-board-directory-link" href="#/boards-directory?project=${state.project}">View boards directory</a>`;
    button.parentElement.append(picker);$('input',picker).focus();
  }
  function directory() {
    const rows=matching(directoryQuery), searching=!!directoryQuery.trim();
    const table=$('.team-directory-table'); if(!table)return;
    table.innerHTML=`<thead><tr><th>Name</th><th>Team</th><th aria-label="Actions"></th></tr></thead><tbody>${groups(rows,true).map(([key,label,items])=>`<tr class="team-directory-group"><th colspan="3">${button('team-directory-group',`<span>${items.length?icon(folded.has(key)&&!searching?'chevronRight':'chevron'):''}</span>${label}`,`data-group="${key}" ${items.length?`aria-expanded="${!folded.has(key)||searching}"`:'disabled'}`,'quiet')}</th></tr>${(!folded.has(key)||searching)?items.map(r=>`<tr data-directory-team="${r.id}"><td><a href="${href(r.id)}">${icon('boardsNav')}<span>${esc(r.name)} boards</span></a></td><td>${button('team-board-profile',icon('team')+`<span>${esc(r.name)}</span>`,`data-id="${r.id}"`,'quiet')}</td><td>${star(r)}${button('team-board-profile',icon('team'),`data-id="${r.id}" aria-label="Show Team Profile"`,'quiet')}</td></tr>`).join(''):''}`).join('')}</tbody>`;
    $('#team-directory-empty').hidden=rows.length>0;
  }
  async function profile(id) {
    close(); const project=state.project, result=await api(base()+`/teams/${id}/members`);
    if(project!==state.project)return;
    const ids=new Set(result.members.map(m=>m.id));
    const eligible=state.meta.members.filter(m=>!ids.has(m.id));
    modal('Team Profile',`<h2>${esc(result.team.name)}</h2><p>${esc(state.meta.project.name)}</p><div class="nimbus-team-members">${result.members.map(m=>`<div>${avatar(m.name)}<span>${esc(m.name)}</span>${state.user.admin?button('team-remove-member',icon('close'),`data-team="${id}" data-user="${m.id}" aria-label="Remove ${esc(m.name)} from team"`,'quiet'):''}</div>`).join('')||'<p>No team members</p>'}</div>${state.user.admin?`<div class="team-member-add">${field('Add team member',select('team_member',option('','Select a project member','')+eligible.map(m=>option(m.id,m.name,'')).join('')))}${button('team-add-member','Add',`data-team="${id}"`,'primary')}</div>`:''}`,async()=>closeDialog(true),'Close');
  }
  async function refresh() { const project=state.project,sequence=state.sequence;const rows=await api(base()+'/boards-directory');if(project===state.project&&sequence===state.sequence)entries=rows; }
  const previousRender=MiniBoards.renderPage;
  MiniBoards.renderPage=async sequence=>{
    close();
    if(state.page==='boards-directory'){
      await refresh();if(sequence!==state.sequence)return true;
      $('#page-content').innerHTML=`<div class="team-directory-toolbar"><h1>Boards</h1>${button('team-directory-filter',icon('filter'),'aria-label="Show filter" aria-expanded="false"','quiet')}</div><div class="team-directory-filter" hidden><label>${icon('filter')}<input type="search" placeholder="Filter by keywords" aria-label="Filter team boards"></label></div><div class="team-directory-wrap"><table class="team-directory-table"></table><p id="team-directory-empty" class="team-board-empty" role="status" hidden>No team boards found</p></div>`;
      directoryQuery='';directory();return true;
    }
    const handled=await previousRender(sequence);
    if(!handled||sequence!==state.sequence||state.page!=='board')return handled;
    await refresh();if(sequence!==state.sequence)return handled;
    const select=$('.team-toolbar [name=team_id]');if(!select)return handled;
    select.hidden=true;const oldIcon=$(':scope > .ui-icon',select.parentElement);oldIcon?.remove();
    const wrapper=document.createElement('div');wrapper.className='team-board-picker';
    const selected=entries.find(r=>r.id===Number(select.value));
    wrapper.innerHTML=button('team-board-picker',icon('boardsNav')+`<span>${esc(selected?.name||select.selectedOptions[0].textContent)}</span>`+icon('chevron'),'aria-label="Choose team board" aria-expanded="false" aria-haspopup="dialog" aria-controls="team-board-menu"','quiet team-board-trigger');
    select.before(wrapper);
    const profileButton=$('[data-action=nimbus-team-profile]');if(profileButton)profileButton.innerHTML=icon('team');
    const favorite=$('[data-action=nimbus-team-favorite]');
    if(favorite){favorite.dataset.id=select.value;favorite.setAttribute('aria-pressed',String(!!Number(selected?.favorite)));favorite.setAttribute('aria-label',Number(selected?.favorite)?'Remove from favorites':'Add to favorites');}
    // Remember visits on the server, without changing shared board content.
    await api(base()+`/teams/${select.value}/visit`,{method:'POST',body:{}});
    return handled;
  };
  const oldHandle=handle;
  handle=async(action,element)=>{
    if(action==='team-board-picker')return open(element);
    if(action==='team-directory-filter') {const f=$('.team-directory-filter');f.hidden=!f.hidden;element.setAttribute('aria-expanded',String(!f.hidden));if(!f.hidden)$('input',f).focus();return;}
    if(action==='team-directory-group'){const key=element.dataset.group;folded.has(key)?folded.delete(key):folded.add(key);directory();return;}
    if(action==='team-board-favorite'||action==='nimbus-team-favorite'){
      const id=Number(element.dataset.id), favorite=element.getAttribute('aria-pressed')!=='true';element.disabled=true;
      try {await api(base()+`/teams/${id}/favorite`,{method:'PUT',body:{favorite}});const r=entries.find(r=>r.id===id);if(r)r.favorite=Number(favorite);
        for(const b of document.querySelectorAll(`[data-action=team-board-favorite][data-id="${id}"],[data-action=nimbus-team-favorite][data-id="${id}"]`)){b.setAttribute('aria-pressed',String(favorite));b.setAttribute('aria-label',favorite?'Remove from favorites':'Add to favorites');}
        if(state.page==='boards-directory')directory();
        if(picker){$('.team-board-options',picker).innerHTML=list();$(`[data-action=team-board-favorite][data-id="${id}"]`,picker)?.focus();}
      }finally{element.disabled=false;}return;
    }
    if(action==='team-board-profile'||action==='nimbus-team-profile')return profile(Number(element.dataset.id||state.filters.team_id));
    if(action==='team-add-member'||action==='team-remove-member'){
      const team=Number(element.dataset.team),uid=Number(element.dataset.user||$('#dialog [name=team_member]').value);if(!uid){toast('Select a project member');return;}
      await api(base()+`/teams/${team}/members/${uid}`,{method:action==='team-add-member'?'PUT':'DELETE',body:{}});closeDialog(true);await refresh();if(state.page==='boards-directory')directory();return profile(team);
    }
    return oldHandle(action,element);
  };
  document.addEventListener('input',e=>{
    if(e.target.matches('.team-board-search input')){query=e.target.value;$('.team-board-options',picker).innerHTML=list();}
    if(e.target.matches('.team-directory-filter input')){directoryQuery=e.target.value;directory();}
  });
  document.addEventListener('pointerdown',e=>{if(picker&&!e.target.closest('.team-board-picker'))close();});
  document.addEventListener('click',e=>{const link=e.target.closest('[data-team-option]');if(link){close();if(link.hash===location.hash){e.preventDefault();render();}}});
  document.addEventListener('keydown',e=>{
    if(!picker)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(true);return;}
    if(!picker.contains(e.target))return;
    const options=[...picker.querySelectorAll('[data-team-option]')],index=options.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&(!e.target.matches('input')||['ArrowDown','ArrowUp'].includes(e.key))){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:index<0?(e.key==='ArrowDown'?0:options.length-1):(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next]?.focus();}
    if(e.key==='Enter'&&e.target.matches('input')){e.preventDefault();options[0]?.click();}
  },true);
  document.addEventListener('focusin',e=>{if(picker&&!e.target.closest('.team-board-picker'))close();});
  window.addEventListener('hashchange',()=>close());
  return {profile};
})();
