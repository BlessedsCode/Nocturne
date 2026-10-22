let browserSettings={},historyEntries=[],historySelected=new Set(),historyLimit=100;
function selectSettingsSection(name){
  $('settings-search').value='';$('settings-search-empty').hidden=true;
  document.querySelectorAll('[data-section]').forEach(b=>{b.classList.toggle('active',b.dataset.section===name);b.setAttribute('aria-selected',String(b.dataset.section===name));});
  document.querySelectorAll('.settings-section').forEach(el=>el.hidden=el.id!==name+'-section');
  document.querySelectorAll('.setting-card').forEach(el=>el.hidden=false);
  document.querySelector('.settings-scroll').scrollTop=0;
  if(name==='passwords'){loadPasswords();if(!$('detected-browsers').children.length)$('detect-browsers').click();}if(name==='history')loadHistory();
  if(name==='security'&&typeof loadSecurityState==='function')loadSecurityState();
  if(name==='extensions'&&typeof loadExtensionsSection==='function')loadExtensionsSection();
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

let installedExtensions = [], catalogExtensions = [], currentExtFilter = 'all', extSearchTimer = null;

async function loadExtensionsSection() {
  const data = await action('extensions-list');
  if (data && !data.error) {
    installedExtensions = Array.isArray(data.installed) ? data.installed : [];
    catalogExtensions = Array.isArray(data.catalog) ? data.catalog : [];
  }
  renderExtensionsUI();
}

function renderExtensionsUI() {
  const countEl = $('ext-installed-count');
  if (countEl) countEl.textContent = installedExtensions.length;

  const installedCard = $('extensions-installed-container');
  const catalogCard = $('extensions-catalog-container');
  const installedList = $('extensions-installed-list');
  const catalogList = $('extensions-catalog-list');

  if (!installedList || !catalogList) return;

  installedList.className = 'extensions-grid';
  catalogList.className = 'extensions-grid';

  installedList.replaceChildren();
  if (installedExtensions.length === 0) {
    installedList.append(text('p', 'Нет установленных расширений.', 'ext-empty'));
  } else {
    for (const item of installedExtensions) {
      installedList.append(createExtensionCard(item, true));
    }
  }

  catalogList.replaceChildren();
  if (catalogExtensions.length === 0) {
    catalogList.append(text('p', 'Ничего не найдено.', 'ext-empty'));
  } else {
    for (const item of catalogExtensions) {
      catalogList.append(createExtensionCard(item, false));
    }
  }

  if (currentExtFilter === 'installed') {
    installedCard.hidden = false;
    catalogCard.hidden = true;
  } else {
    installedCard.hidden = installedExtensions.length === 0;
    catalogCard.hidden = false;
  }
}

function createExtensionCard(item, isInstalled) {
  const card = document.createElement('div');
  card.className = 'extension-card';
  card.dataset.extId = item.id;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'ext-icon-wrap';
  if (item.icon) {
    const img = document.createElement('img');
    img.src = item.icon;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.remove(); iconWrap.innerHTML = '<span class="ext-icon-fallback">🧩</span>'; };
    iconWrap.append(img);
  } else {
    iconWrap.innerHTML = '<span class="ext-icon-fallback">🧩</span>';
  }

  const content = document.createElement('div');
  content.className = 'ext-content';

  const header = document.createElement('div');
  header.className = 'ext-header';

  const name = document.createElement('span');
  name.className = 'ext-name';
  name.textContent = item.name;
  header.append(name);

  if (item.version) {
    const ver = document.createElement('span');
    ver.className = 'ext-version';
    ver.textContent = 'v' + item.version;
    header.append(ver);
  }

  if (item.rating) {
    const rat = document.createElement('span');
    rat.className = 'ext-rating';
    rat.textContent = '★ ' + item.rating;
    header.append(rat);
  }

  const badges = document.createElement('span');
  badges.className = 'ext-badges';
  const sources = Array.isArray(item.sources) ? item.sources : (item.source ? [item.source] : []);
  if (sources.includes('chrome') || item.chromeId) {
    const b = document.createElement('span');
    b.className = 'ext-badge chrome';
    b.textContent = 'Chrome';
    badges.append(b);
  }
  if (sources.includes('firefox') || item.amoSlug) {
    const b = document.createElement('span');
    b.className = 'ext-badge firefox';
    b.textContent = 'Firefox';
    badges.append(b);
  }
  header.append(badges);

  const desc = document.createElement('p');
  desc.className = 'ext-desc';
  desc.textContent = item.summary || item.description || 'Расширение для браузера';

  content.append(header, desc);

  const actions = document.createElement('div');
  actions.className = 'ext-actions';

  if (isInstalled) {
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'ext-toggle-wrap';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.enabled !== false;
    const statusText = document.createTextNode(item.enabled !== false ? ' Включено' : ' Отключено');
    checkbox.onchange = async () => {
      checkbox.disabled = true;
      try {
        const res = await action('extensions-toggle', { id: item.id, enabled: checkbox.checked });
        if (res?.error) {
          checkbox.checked = !checkbox.checked;
        } else {
          statusText.textContent = checkbox.checked ? ' Включено' : ' Отключено';
          toast(checkbox.checked ? ('Расширение «' + item.name + '» включено') : ('Расширение «' + item.name + '» отключено'));
        }
      } finally {
        checkbox.disabled = false;
      }
    };
    toggleLabel.append(checkbox, statusText);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ext-remove-btn';
    removeBtn.textContent = 'Удалить';
    removeBtn.onclick = async () => {
      removeBtn.disabled = true;
      removeBtn.textContent = 'Удаление…';
      try {
        const res = await action('extensions-remove', item.id);
        if (!res?.error) {
          toast('Расширение «' + item.name + '» удалено');
          await loadExtensionsSection();
        }
      } finally {
        removeBtn.disabled = false;
      }
    };
    actions.append(toggleLabel, removeBtn);
  } else {
    const isAlready = installedExtensions.some(inst =>
      inst.id === item.id ||
      (item.chromeId && inst.chromeId === item.chromeId) ||
      (item.amoSlug && inst.amoSlug === item.amoSlug) ||
      (inst.name && item.name && inst.name.toLowerCase() === item.name.toLowerCase())
    );

    if (isAlready) {
      const badgeInst = document.createElement('span');
      badgeInst.className = 'ext-badge installed';
      badgeInst.textContent = 'Установлено';
      actions.append(badgeInst);
    } else {
      const installBtn = document.createElement('button');
      installBtn.className = 'ext-install-btn';
      installBtn.textContent = 'Установить';
      installBtn.onclick = async () => {
        installBtn.disabled = true;
        installBtn.textContent = 'Установка…';
        try {
          const res = await action('extensions-install', item);
          if (res && !res.error) {
            toast('Расширение «' + item.name + '» успешно установлено');
            await loadExtensionsSection();
          } else {
            installBtn.textContent = 'Ошибка';
            setTimeout(() => { installBtn.textContent = 'Установить'; installBtn.disabled = false; }, 2000);
          }
        } catch (e) {
          installBtn.textContent = 'Ошибка';
          setTimeout(() => { installBtn.textContent = 'Установить'; installBtn.disabled = false; }, 2000);
        }
      };
      actions.append(installBtn);
    }
  }

  card.append(iconWrap, content, actions);
  return card;
}

if ($('ext-filter-all')) {
  $('ext-filter-all').onclick = () => {
    currentExtFilter = 'all';
    $('ext-filter-all').classList.add('active');
    $('ext-filter-installed').classList.remove('active');
    renderExtensionsUI();
  };
}
if ($('ext-filter-installed')) {
  $('ext-filter-installed').onclick = () => {
    currentExtFilter = 'installed';
    $('ext-filter-installed').classList.add('active');
    $('ext-filter-all').classList.remove('active');
    renderExtensionsUI();
  };
}
if ($('extensions-search-input')) {
  $('extensions-search-input').oninput = () => {
    clearTimeout(extSearchTimer);
    extSearchTimer = setTimeout(async () => {
      const query = $('extensions-search-input').value.trim();
      if (!query) {
        const data = await action('extensions-list');
        catalogExtensions = data?.catalog || [];
        if ($('extensions-catalog-title')) $('extensions-catalog-title').textContent = 'Каталог расширений';
      } else {
        if ($('extensions-catalog-title')) $('extensions-catalog-title').textContent = 'Результаты поиска:';
        const res = await action('extensions-search', query);
        catalogExtensions = Array.isArray(res) ? res : (res?.results || []);
      }
      renderExtensionsUI();
    }, 300);
  };
}
