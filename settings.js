let browserSettings={},historyEntries=[],historySelected=new Set(),historyLimit=100;
function selectSettingsSection(name){
  $('settings-search').value='';$('settings-search-empty').hidden=true;
  document.querySelectorAll('[data-section]').forEach(b=>{b.classList.toggle('active',b.dataset.section===name);b.setAttribute('aria-selected',String(b.dataset.section===name));});
  document.querySelectorAll('.settings-section').forEach(el=>el.hidden=el.id!==name+'-section');
  document.querySelectorAll('.setting-card').forEach(el=>el.hidden=false);
  document.querySelector('.settings-scroll').scrollTop=0;
  if(name==='passwords'){loadPasswords();if(!$('detected-browsers').children.length)$('detect-browsers').click();}if(name==='history')loadHistory();
  if(name==='security'&&typeof loadSecurityState==='function')loadSecurityState();
}
document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>selectSettingsSection(b.dataset.section));
async function loadBrowserSettings(){
  const result=await action('settings-get');if(!result||result.error)return;browserSettings=result;
  document.querySelectorAll('[data-browser-setting]').forEach(input=>{const value=result[input.dataset.browserSetting];if(input.type==='checkbox')input.checked=!!value;else input.value=value;});
  $('download-directory').textContent=result.downloadDirectory;$('browser-version').textContent='Версия '+result.versions.app;
  $('engine-version').textContent='Chromium '+result.versions.chromium+' · Electron '+result.versions.electron;
}
document.querySelectorAll('[data-browser-setting]').forEach(input=>input.onchange=async()=>{
  const value=input.type==='checkbox'?input.checked:input.dataset.browserSetting==='zoom'?Number(input.value):input.value;
  const result=await action('settings-update',{[input.dataset.browserSetting]:value});if(result?.error)loadBrowserSettings();else browserSettings={...browserSettings,...result};
});
for(const [id,key] of [['show-home-links','showHomeLinks'],['show-sidebar-links','showSidebarLinks']])$(id).onchange=()=>{preferences[key]=$(id).checked;applyPreferences();};
$('choose-download-directory').onclick=async()=>{const result=await action('choose-download-directory');if(result?.directory)$('download-directory').textContent=result.directory;};
$('clear-data').onclick=async()=>{const result=await action('clear-browsing-data',{cache:$('clear-cache').checked,cookies:$('clear-cookies').checked,history:$('clear-history').checked});if(result?.cleared){toast('Выбранные данные удалены');loadHistory();}};
const historyTools=document.createElement('div');historyTools.id='history-actions';
const selectAllLabel=document.createElement('label'),selectAll=document.createElement('input');selectAll.type='checkbox';selectAll.id='history-select-all';selectAllLabel.append(selectAll,document.createTextNode('Выбрать все найденные'));
const deleteSelected=button('Удалить выбранное','Удалить выбранные записи',()=>deleteHistory({ids:[...historySelected]}),'subtle');deleteSelected.id='history-delete-selected';
const deleteAll=button('Удалить всю историю…','Удалить всю историю текущего профиля',()=>deleteHistory({all:true}),'subtle');deleteAll.id='history-delete-all';
historyTools.append(selectAllLabel,deleteSelected,deleteAll);$('history-search').after(historyTools);
const filteredHistory=()=>historyEntries.filter(entry=>(entry.title+' '+entry.url).toLowerCase().includes($('history-search').value.toLowerCase()));
async function deleteHistory(value){
 const result=await action('history-delete',value);if(!result||result.error||result.canceled)return;
 historyEntries=result.history;historySelected=new Set([...historySelected].filter(id=>historyEntries.some(entry=>entry.id===id)));renderHistory();toast('Удалено записей: '+result.deleted);
}
async function loadHistory(){const result=await action('history-list');if(Array.isArray(result)){historyEntries=result;historySelected=new Set([...historySelected].filter(id=>result.some(entry=>entry.id===id)));renderHistory();}}
function renderHistory(){
 $('history-list').replaceChildren();const entries=filteredHistory();
 if(!entries.length)$('history-list').append(text('p',historyEntries.length?'Ничего не найдено.':'История пуста.'));
 const selected=entries.filter(entry=>historySelected.has(entry.id)).length;selectAll.checked=entries.length>0&&selected===entries.length;selectAll.indeterminate=selected>0&&selected<entries.length;selectAll.disabled=!entries.length;deleteSelected.disabled=!historySelected.size;deleteSelected.textContent='Удалить выбранное'+(historySelected.size?' ('+historySelected.size+')':'');deleteAll.disabled=!historyEntries.length;
 for(const entry of entries.slice(0,historyLimit)){
  const row=document.createElement('div');row.className='history-row';row.dataset.historyId=entry.id;
  const check=document.createElement('input');check.type='checkbox';check.checked=historySelected.has(entry.id);check.setAttribute('aria-label','Выбрать '+(entry.title||entry.url));check.onchange=()=>{if(check.checked)historySelected.add(entry.id);else historySelected.delete(entry.id);renderHistory();};
  const open=button('',entry.url,()=>go(entry.url),'history-entry');const info=document.createElement('span');info.append(text('strong',entry.title||entry.url),text('small',entry.url));open.append(favicon('',entry.url,entry.title),info,text('time',new Date(entry.time).toLocaleString('ru')));
  const remove=button('×','Удалить запись',()=>deleteHistory({ids:[entry.id]}),'history-remove');remove.setAttribute('aria-label','Удалить запись '+(entry.title||entry.url));row.append(check,open,remove);$('history-list').append(row);
 }
 if(entries.length>historyLimit)$('history-list').append(button('Показать ещё','Показать следующие записи',()=>{historyLimit+=100;renderHistory();},'subtle'));
}
selectAll.onchange=()=>{for(const entry of filteredHistory())if(selectAll.checked)historySelected.add(entry.id);else historySelected.delete(entry.id);renderHistory();};
$('history-search').oninput=()=>{historyLimit=100;renderHistory();};
$('settings-search').oninput=()=>{
 const query=$('settings-search').value.trim().toLowerCase();if(!query){const active=document.querySelector('[data-section].active')?.dataset.section||'general';selectSettingsSection(active);return;}
 let matches=0;document.querySelectorAll('.settings-section').forEach(section=>{const match=section.textContent.toLowerCase().includes(query);section.hidden=!match;if(match){matches++;section.querySelectorAll('.setting-card').forEach(card=>card.hidden=!card.textContent.toLowerCase().includes(query));}});$('settings-search-empty').hidden=matches>0;
};
loadBrowserSettings();
