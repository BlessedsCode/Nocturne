const $=id=>document.getElementById(id), api=window.browser;
function stored(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));if(Array.isArray(fallback))return Array.isArray(value)?value:fallback;if(fallback&&typeof fallback==='object')return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback;return value??fallback;}catch{return fallback;}}
let state={tabs:[],active:0},saved=stored('favorites',[]),tabSignature='';
let links=stored('quick-links',api?.profile==='personal'?[]:[{id:'pinterest',name:'Pinterest',url:'https://www.pinterest.com/'},{id:'youtube',name:'YouTube',url:'https://www.youtube.com/'},{id:'github',name:'GitHub',url:'https://github.com/'}]);
saved=saved.filter(item=>item&&typeof item.url==='string');
links=links.filter(link=>link&&typeof link.url==='string'&&typeof link.name==='string').map(link=>({home:true,sidebar:true,...link}));
const faviconCache=stored('favicons',{});
for(const [key,value] of Object.entries(faviconCache))if(typeof value!=='string')delete faviconCache[key];
const MAX_FAVICONS=150;let saveIconTimer=null;
function scheduleSaveIconCache(){if(!saveIconTimer){saveIconTimer=setTimeout(()=>{saveIconTimer=null;saveIconCache();},2000);}}
function trimFaviconCache(){const keys=Object.keys(faviconCache);let bytes=keys.reduce((n,k)=>n+faviconCache[k].length*2,0);while(keys.length>MAX_FAVICONS||bytes>2.5*1024*1024){const key=keys.shift();bytes-=faviconCache[key].length*2;delete faviconCache[key];}}
trimFaviconCache();
function setFaviconCache(origin,icon){if(faviconCache[origin]===icon)return;delete faviconCache[origin];faviconCache[origin]=icon;trimFaviconCache();scheduleSaveIconCache();}
const iconRequests=new Map();
function saveIconCache(){try{localStorage.setItem('favicons',JSON.stringify(Object.fromEntries(Object.entries(faviconCache).filter(([,value])=>!value.startsWith('data:')))));}catch{}}
const defaults={opacity:42,blur:18,brightness:85,saturation:110,texture:true,preset:'dark'};
let settings={...defaults,...stored('glass',{})},preferences={interfaceColor:'moss',wallpaper:'mont',engine:'google',animations:true,showHomeLinks:true,showSidebarLinks:true,...stored('preferences',{})};
const panelIds=['settings','favorites','downloads-panel','links-panel'];
let downloadList=[],passwordList=[];
let reloadUntil=0,reloadTimer;
function updateReloadAnimation(loading){
  clearTimeout(reloadTimer);const el=$('reload');
  const spinning=!!loading||performance.now()<reloadUntil;
  el.classList.toggle('is-loading',spinning);el.setAttribute('aria-busy',String(!!loading));
  if(!loading&&spinning)reloadTimer=setTimeout(()=>updateReloadAnimation(false),Math.max(0,reloadUntil-performance.now()));
}
function favicon(source,url,title){
  const wrap=document.createElement('span');wrap.className='site-icon';wrap.append(text('span','◎','site-icon-fallback'));
  const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';
  let fallback='';try{const parsed=new URL(url);if(['https:','http:'].includes(parsed.protocol)){fallback=parsed.origin+'/favicon.ico';source=source||faviconCache[parsed.origin]||'';}}catch{}
  const valid=/^https?:\/\//i.test(source||'')||/^data:image\//i.test(source||'');let retried=false;
  img.onload=()=>wrap.classList.add('has-image');
  img.onerror=()=>{if(!retried&&fallback&&img.src!==fallback){retried=true;img.src=fallback;}else{img.remove();wrap.classList.remove('has-image');}};
  if(valid||fallback){img.src=valid?source:fallback;wrap.append(img);}
  if(!source&&fallback){const origin=new URL(url).origin;
    if(!iconRequests.has(origin)){
      const req=Promise.resolve(command('favicon-get',url)).then(result=>{
        if(result?.icon)setFaviconCache(origin,result.icon);
        return result;
      }).catch(()=>{}).finally(()=>{iconRequests.delete(origin);});
      iconRequests.set(origin,req);
    }
    iconRequests.get(origin).then(result=>{if(result?.icon){img.src=result.icon;if(!img.isConnected)wrap.append(img);}}).catch(()=>{});
  }return wrap;
}
const command=(action,value)=>api?.command(action,value);
function button(value,title,click,className=''){const el=document.createElement('button');el.className=className;decorateButton(el,value);el.title=title;el.onclick=click;return el;}
function text(tag,value,className=''){const el=document.createElement(tag);el.className=className;if(className==='site-icon-fallback')el.append(createIcon('globe'));else if(className==='favorite-arrow')el.append(createIcon('arrow'));else el.textContent=value;return el;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
async function action(name,value){const result=await command(name,value);if(result?.error)toast(result.error);return result;}
async function go(value){
  await closePanels();value=String(value||'').trim();
  const host=/^(localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?([/?#].*)?$/;
  if(value&&!host.test(value)&&!/^\w[\w+.-]*:/i.test(value))value=searchEngines.searchURL(preferences.engine,value);
  await action('navigate',value);
}
function hidePanel(el,animate){
  el._animation?.cancel();if(el.hidden)return Promise.resolve();
  if(!animate||!preferences.animations||matchMedia('(prefers-reduced-motion: reduce)').matches){el.hidden=true;return Promise.resolve();}
  const animation=el.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(-14px)'}],{duration:160,easing:'ease-in'});el._animation=animation;
  return animation.finished.then(()=>{el.hidden=true;el._animation=null;}).catch(()=>{});
}
async function closePanels(animate=true){await Promise.all(panelIds.map(id=>hidePanel($(id),animate)));if(panelIds.every(id=>$(id).hidden)){command('overlay',false);$('settings-button').classList.remove('active');}}
async function panel(id){
  document.dispatchEvent(new Event('browser-panel-opening'));
  const el=$(id);if(!el.hidden)return closePanels();await closePanels(false);el._animation?.cancel();el.hidden=false;command('overlay',true);
  $('settings-button').classList.toggle('active',id==='settings');
  if(preferences.animations&&!matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate([{opacity:0,transform:'translateX(-18px) scale(.985)'},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});
  if(id==='favorites')renderFavorites();if(id==='links-panel')renderLinksManager();
  if(id==='downloads-panel'){const list=await action('downloads',{action:'list'});if(Array.isArray(list))downloadList=list;renderDownloads();}
  if(id==='settings'&&!$('passwords-section').hidden)loadPasswords();
  if(id==='settings'&&typeof loadBrowserSettings==='function')loadBrowserSettings();
}
let draggedTabId=null,wasDraggingTab=false;
function createTabElement(t, s){
  const tab=document.createElement('div');
  tab.dataset.tabId=String(t.id);
  tab.className='tab'+(t.id===s.active?' active':'')+(t.loading?' tab-loading':'')+(t.sleeping?' tab-sleeping':'');
  tab.draggable=true;
  const fav=favicon(t.favicon,t.url,t.title);
  fav.classList.add('tab-icon');
  tab._lastFavicon=t.favicon||t.url||'';
  const titleSpan=text('span',t.title,'tab-title');
  const closeBtn=button('×','Закрыть вкладку',e=>{e.stopPropagation();command('close-tab',t.id);});
  tab.append(fav,titleSpan,closeBtn);
  tab.onclick=async()=>{
    if(wasDraggingTab){wasDraggingTab=false;return;}
    await closePanels();
    command('switch',t.id);
  };
  tab.onauxclick=e=>{
    if(e.button===1){
      e.preventDefault();
      e.stopPropagation();
      command('close-tab',t.id);
    }
  };
  tab.onmousedown=e=>{
    if(e.button===1){
      e.preventDefault();
    }
  };
  tab.oncontextmenu=e=>{
    e.preventDefault();
    e.stopPropagation();
    command('tab-context-menu',{id:t.id,x:e.clientX,y:e.clientY});
  };
  tab.ondragstart=e=>{
    draggedTabId=t.id;
    wasDraggingTab=true;
    e.dataTransfer.setData('text/plain',String(t.id));
    e.dataTransfer.effectAllowed='move';
    tab.classList.add('tab-dragging');
  };
  tab.ondragend=()=>{
    draggedTabId=null;
    tab.classList.remove('tab-dragging');
    document.querySelectorAll('.tab').forEach(el=>el.classList.remove('drag-over-before','drag-over-after'));
    setTimeout(()=>{wasDraggingTab=false;},100);
  };
  tab.ondragover=e=>{
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    const rect=tab.getBoundingClientRect();
    if(e.clientX < rect.left + rect.width / 2){
      tab.classList.add('drag-over-before');
      tab.classList.remove('drag-over-after');
    } else {
      tab.classList.add('drag-over-after');
      tab.classList.remove('drag-over-before');
    }
  };
  tab.ondragleave=()=>{
    tab.classList.remove('drag-over-before','drag-over-after');
  };
  tab.ondrop=e=>{
    e.preventDefault();
    e.stopPropagation();
    tab.classList.remove('drag-over-before','drag-over-after');
    const srcId=Number(e.dataTransfer.getData('text/plain')||draggedTabId);
    const targetId=t.id;
    if(!srcId||srcId===targetId)return;
    const rect=tab.getBoundingClientRect();
    const before=e.clientX < rect.left + rect.width / 2;
    const ids=state.tabs.map(item=>item.id);
    const srcIdx=ids.indexOf(srcId);
    if(srcIdx===-1)return;
    ids.splice(srcIdx,1);
    const targetIdx=ids.indexOf(targetId);
    if(targetIdx===-1)return;
    ids.splice(before?targetIdx:targetIdx+1,0,srcId);
    command('reorder-tabs',ids);
  };
  updateTabElement(tab,t,s);
  return tab;
}
function updateTabElement(tab, t, s){
  tab.classList.toggle('active', t.id===s.active);
  tab.classList.toggle('tab-loading', !!t.loading);
  tab.classList.toggle('tab-sleeping', !!t.sleeping);
  let mute=tab.querySelector('.tab-mute');
  if(t.muted&&!mute){mute=button('','Включить звук вкладки',e=>{e.stopPropagation();command('tab-toggle-mute',t.id);},'tab-mute');mute.setAttribute('aria-label','Включить звук вкладки');mute.append(createIcon('muted'));tab.querySelector('.tab-title').after(mute);}
  if(!t.muted&&mute)mute.remove();
  const titleSpan=tab.querySelector('.tab-title');
  if(titleSpan && titleSpan.textContent!==t.title){
    titleSpan.textContent=t.title;
  }
  const iconKey=t.favicon||t.url||'';
  if(tab._lastFavicon!==iconKey){
    tab._lastFavicon=iconKey;
    const oldIcon=tab.querySelector('.tab-icon');
    const newIcon=favicon(t.favicon,t.url,t.title);
    newIcon.classList.add('tab-icon');
    if(oldIcon)oldIcon.replaceWith(newIcon);
    else tab.prepend(newIcon);
  }
}
function render(s){
  state=s;const signature=JSON.stringify([s.tabs,s.active]);
  if(signature!==tabSignature){
    tabSignature=signature;
    const tabsContainer=$('tabs');
    const existingElements=new Map();
    for(const child of Array.from(tabsContainer.children)){
      if(child.dataset.tabId)existingElements.set(Number(child.dataset.tabId),child);
    }
    const currentTabIds=new Set(s.tabs.map(t=>t.id));
    for(const [id,el] of existingElements){
      if(!currentTabIds.has(id))el.remove();
    }
    for(let i=0;i<s.tabs.length;i++){
      const t=s.tabs[i];
      let el=existingElements.get(t.id);
      if(!el){
        el=createTabElement(t,s);
      }else{
        updateTabElement(el,t,s);
      }
      const currentAtPos=tabsContainer.children[i];
      if(currentAtPos!==el){
        tabsContainer.insertBefore(el,currentAtPos||null);
      }
    }
  }
  const t=s.tabs.find(t=>t.id===s.active);if(document.activeElement!==$('address'))$('address').value=t?.url||'';
  $('back').disabled=!s.back;$('forward').disabled=!s.forward;document.body.classList.toggle('error',!!t?.error);$('error-page').hidden=!t?.error;$('error-message').textContent=t?.error?'Не удалось открыть страницу. '+t.error:'';
  setButtonIcon($('bookmark'),saved.some(b=>b.url===t?.url)?'star-filled':'star');
  if(typeof renderSecurityWarning==='function')renderSecurityWarning(t);
  updateReloadAnimation(t?.loading);
  let changed=false,iconsChanged=false;for(const tab of s.tabs){if(tab.url&&tab.favicon){try{const origin=new URL(tab.url).origin;if(faviconCache[origin]!==tab.favicon){setFaviconCache(origin,tab.favicon);iconsChanged=true;}}catch{}}const bookmark=saved.find(b=>b.url===tab.url);if(bookmark){if(tab.favicon&&bookmark.favicon!==tab.favicon){bookmark.favicon=tab.favicon;changed=true;}if(!tab.loading&&tab.title&&bookmark.title!==tab.title){bookmark.title=tab.title;changed=true;}}}
  if(iconsChanged){saveIconCache();renderQuickLinks();}
  if(changed){localStorage.setItem('favorites',JSON.stringify(saved));if(!$('favorites').hidden)renderFavorites();}
}
api?.onState(render);api?.onFocusAddress(()=>{$('address').focus();$('address').select();});api?.onDownloads(list=>{downloadList=list;renderDownloads();});
api?.onOpenDownloads(()=>panel('downloads-panel'));
$('address-form').onsubmit=e=>{e.preventDefault();const value=$('address').value;$('address').blur();go(value);};
$('search-form').onsubmit=e=>{e.preventDefault();go($('search').value);};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>command(b.dataset.action));
$('reload').onclick=()=>{reloadUntil=performance.now()+650;updateReloadAnimation(true);Promise.resolve(command('reload')).finally(()=>updateReloadAnimation(state.tabs.find(t=>t.id===state.active)?.loading));};
$('new').onclick=async()=>{await closePanels();command('new');};$('home').onclick=()=>go('nocturne://home');
$('settings-button').onclick=()=>panel('settings');$('close-settings').onclick=()=>closePanels();
$('favorites-button').onclick=()=>panel('favorites');$('close-favorites').onclick=()=>closePanels();
$('downloads-button').onclick=()=>panel('downloads-panel');$('close-downloads').onclick=()=>closePanels();
$('close-links').onclick=()=>closePanels();$('manage-links').onclick=()=>panel('links-panel');$('settings-downloads').onclick=()=>panel('downloads-panel');
$('retry').onclick=async()=>{await closePanels();command('reload');};$('error-home').onclick=()=>go('nocturne://home');
$('bookmark').onclick=()=>{const t=state.tabs.find(t=>t.id===state.active);if(!t?.url)return toast('Сначала открой сайт');const index=saved.findIndex(b=>b.url===t.url);if(index>=0)saved.splice(index,1);else saved.push({title:t.title,url:t.url,favicon:t.favicon||''});localStorage.setItem('favorites',JSON.stringify(saved));render(state);toast(index>=0?'Удалено из избранного':'Добавлено в избранное');};
function renderFavorites(){
  $('favorites-list').replaceChildren();if(!saved.length)$('favorites-list').append(text('p','Сохраняй любимые сайты кнопкой ☆ у адресной строки.'));
  for(const b of saved){const row=document.createElement('div');row.className='saved-row';const open=button('',b.url,()=>go(b.url),'favorite-open');open.onauxclick=e=>{if(e.button===1){e.preventDefault();command('open-tab',b.url);}};open.oncontextmenu=e=>{e.preventDefault();navigator.clipboard.writeText(b.url);toast('Адрес ссылки скопирован');};const info=document.createElement('span');info.className='favorite-info';let host=b.url;try{host=new URL(b.url).hostname;}catch{}info.append(text('strong',b.title||host),text('small',host));open.append(favicon(b.favicon,b.url,b.title||host),info,text('span','↗','favorite-arrow'));
    row.append(open,button('×','Удалить',()=>{saved=saved.filter(x=>x!==b);localStorage.setItem('favorites',JSON.stringify(saved));renderFavorites();render(state);}));$('favorites-list').append(row);
  }
}
function persistLinks(){localStorage.setItem('quick-links',JSON.stringify(links));renderQuickLinks();renderLinksManager();}
function unpinLink(link,place){link[place]=false;persistLinks();toast(place==='home'?'Откреплено с главной':'Откреплено с боковой панели');}
function linkMenu(event,link){event.preventDefault();command('link-menu',{id:link.id});}
function editLink(link){$('link-id').value=link.id;$('link-name').value=link.name;$('link-url').value=link.url;$('link-home').checked=link.home;$('link-sidebar').checked=link.sidebar;$('save-link').textContent='Сохранить';$('cancel-link').hidden=false;$('link-name').focus();}
api?.onLinkAction(async({id,kind})=>{const link=links.find(l=>l.id===id);if(!link)return;if(kind==='open')command('open-tab',link.url);else if(kind==='copy'){navigator.clipboard.writeText(link.url);toast('Адрес ссылки скопирован');}else if(kind==='edit'){await panel('links-panel');editLink(link);}else if(kind==='delete'){links=links.filter(l=>l.id!==id);persistLinks();}else unpinLink(link,kind);});
function renderQuickLinks(){
  $('quick-links').replaceChildren();let rail=$('rail-links');if(!rail){rail=document.createElement('div');rail.id='rail-links';document.querySelectorAll('.rail>[data-url]').forEach(el=>el.remove());document.querySelector('.rail-line').after(rail);}rail.replaceChildren();
  for(const link of links){
    if(link.home){const item=document.createElement('div');item.className='quick-link';item.dataset.linkId=link.id;item.oncontextmenu=e=>linkMenu(e,link);item.onauxclick=e=>{if(e.button===1){e.preventDefault();command('open-tab',link.url);}};const b=button('',link.url,()=>go(link.url),'quick-open');b.onauxclick=e=>{if(e.button===1){e.preventDefault();e.stopPropagation();command('open-tab',link.url);}};b.append(favicon('',link.url,link.name),text('span',link.name));item.append(b,button('×','Открепить с главной',()=>unpinLink(link,'home'),'unpin-link'));$('quick-links').append(item);}
    if(link.sidebar){const item=document.createElement('div');item.className='rail-link';item.dataset.linkId=link.id;item.oncontextmenu=e=>linkMenu(e,link);item.onauxclick=e=>{if(e.button===1){e.preventDefault();command('open-tab',link.url);}};const b=button('',link.name,()=>go(link.url),'rail-open');b.onauxclick=e=>{if(e.button===1){e.preventDefault();e.stopPropagation();command('open-tab',link.url);}};b.append(favicon('',link.url,link.name));item.append(b,button('×','Открепить с боковой панели',()=>unpinLink(link,'sidebar'),'unpin-link'));rail.append(item);}
  }
  $('quick-links').append(button('＋','Добавить или изменить быстрые ссылки',()=>panel('links-panel'),'add-quick-link'));
  rail.hidden=!preferences.showSidebarLinks;
}
function resetLinkForm(){$('link-form').reset();$('link-id').value='';$('save-link').textContent='＋ Добавить ссылку';$('cancel-link').hidden=true;$('link-error').textContent='';}
$('cancel-link').onclick=resetLinkForm;
$('link-form').onsubmit=e=>{
  e.preventDefault();let url=$('link-url').value.trim();if(!/^[a-z][a-z\d+.-]*:/i.test(url))url='https://'+url;
  try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password)throw new Error();url=parsed.href;}catch{$('link-error').textContent='Укажи корректный адрес http:// или https://';return;}
  const name=$('link-name').value.trim();if(!name){$('link-error').textContent='Добавь название ссылки.';return;}
  const id=$('link-id').value,existing=links.find(l=>l.id===id),pins={home:$('link-home').checked,sidebar:$('link-sidebar').checked};if(existing)Object.assign(existing,{name,url,...pins});else links.push({id:crypto.randomUUID(),name,url,...pins});resetLinkForm();persistLinks();toast(existing?'Ссылка обновлена':'Ссылка добавлена');
};
function renderLinksManager(){
  $('links-list').replaceChildren();if(!links.length)$('links-list').append(text('p','Нет быстрых ссылок.'));
  links.forEach((link,index)=>{const row=document.createElement('div');row.className='link-row';const info=document.createElement('div');info.append(text('strong',link.name),text('small',new URL(link.url).hostname));const actions=document.createElement('div');actions.className='row-actions';
    const up=button('↑','Выше',()=>{[links[index-1],links[index]]=[links[index],links[index-1]];persistLinks();});up.disabled=index===0;
    const down=button('↓','Ниже',()=>{[links[index+1],links[index]]=[links[index],links[index+1]];persistLinks();});down.disabled=index===links.length-1;
    actions.append(up,down,button('✎','Изменить',()=>editLink(link)),button('×','Удалить ссылку',()=>{links=links.filter(l=>l.id!==link.id);if($('link-id').value===link.id)resetLinkForm();persistLinks();}));
    const pins=document.createElement('div');pins.className='pin-options';for(const [key,label] of [['home','На главной'],['sidebar','Слева']]){const wrap=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=link[key];input.onchange=()=>{link[key]=input.checked;persistLinks();};wrap.append(input,document.createTextNode(label));pins.append(wrap);}info.append(pins);row.append(info,actions);$('links-list').append(row);
  });
}
function apply(){for(const key of ['opacity','blur','brightness','saturation']){$(key).value=settings[key];document.documentElement.style.setProperty('--'+key,key==='blur'?settings[key]+'px':settings[key]/100);$(key+'-value').textContent=settings[key]+(key==='blur'?' px':'%');}$('texture').checked=settings.texture;document.body.classList.toggle('texture',settings.texture);document.documentElement.style.setProperty('--tint',({dark:'26,28,25',smoke:'78,81,74',wine:'57,36,36'})[settings.preset]||'27,26,31');document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===settings.preset));localStorage.setItem('glass',JSON.stringify(settings));}
for(const key of ['opacity','blur','brightness','saturation'])$(key).oninput=()=>{settings[key]=Number($(key).value);apply();};
$('texture').onchange=()=>{settings.texture=$('texture').checked;apply();};document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{settings.preset=b.dataset.preset;apply();});$('reset').onclick=()=>{settings={...defaults};apply();};
document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-section]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-selected',String(el===b));});document.querySelectorAll('.settings-section').forEach(el=>el.hidden=el.id!==b.dataset.section+'-section');if(b.dataset.section==='passwords')loadPasswords();});
function applyPreferences(){document.body.dataset.interfaceColor=['moss','slate','wine','ink'].includes(preferences.interfaceColor)?preferences.interfaceColor:'moss';$('interface-color').value=document.body.dataset.interfaceColor;document.body.classList.toggle('landscape-theme',preferences.wallpaper!=='portrait');$('wallpaper').value=preferences.wallpaper==='portrait'?'portrait':'mont';document.body.classList.toggle('no-motion',!preferences.animations);$('animations').checked=preferences.animations;$('search-engine').value=preferences.engine;$('quick-links').hidden=!preferences.showHomeLinks;const rail=$('rail-links');if(rail)rail.hidden=!preferences.showSidebarLinks;$('show-home-links').checked=preferences.showHomeLinks;$('show-sidebar-links').checked=preferences.showSidebarLinks;localStorage.setItem('preferences',JSON.stringify(preferences));command('set-search-engine',preferences.engine);}
$('interface-color').onchange=()=>{preferences.interfaceColor=$('interface-color').value;applyPreferences();};
$('wallpaper').onchange=()=>{preferences.wallpaper=$('wallpaper').value;applyPreferences();};
$('search-engine').onchange=()=>{preferences.engine=$('search-engine').value;applyPreferences();};$('animations').onchange=()=>{preferences.animations=$('animations').checked;applyPreferences();};
async function loadPasswords(){const list=await action('passwords-list');if(Array.isArray(list)){passwordList=list;renderPasswords();}else $('password-list').replaceChildren(text('p',list?.error||'Хранилище недоступно.'));}
$('import-passwords').onclick=async()=>{
  $('import-passwords').disabled=true;$('import-status').textContent='';
  try{const result=await action('passwords-import');if(result?.error)$('import-status').textContent=result.error;else if(result&&!result.canceled){$('import-status').textContent=`Добавлено: ${result.added} · Обновлено: ${result.updated} · Пропущено: ${result.skipped}`;await loadPasswords();}}finally{$('import-passwords').disabled=false;}
};
$('password-search').oninput=renderPasswords;
function renderPasswords(){
  $('password-list').replaceChildren();const query=$('password-search').value.toLowerCase();const entries=passwordList.filter(p=>(p.origin+' '+p.username).toLowerCase().includes(query));
  $('password-list').append(text('p',`В хранилище: ${passwordList.length}`,'count-label'));
  if(!entries.length)$('password-list').append(text('p',query?'Ничего не найдено.':'Импортируй CSV — здесь появятся сайты и логины.'));
  for(const entry of entries){const row=document.createElement('div');row.className='password-row';row.append(text('strong',new URL(entry.origin).host),text('small',entry.username||'Без логина'));const actions=document.createElement('div');actions.className='row-actions';
    actions.append(button('↗ Сайт','Открыть страницу сайта',()=>go(entry.origin)),button('Заполнить','Заполнить форму входа на текущем сайте',async()=>{const result=await action('passwords-fill',entry.id);if(result?.filled){await closePanels();toast('Логин и пароль заполнены. Вход подтверди на сайте.');}}),button('×','Удалить пароль',async()=>{const result=await action('passwords-delete',entry.id);if(!result?.error)loadPasswords();}));row.append(actions);$('password-list').append(row);
  }
}
function size(bytes){return bytes<1024?bytes+' Б':bytes>=1048576?(bytes/1048576).toFixed(1)+' МБ':(bytes/1024).toFixed(0)+' КБ';}
function renderDownloads(){
  const active=downloadList.filter(d=>d.active).length;$('download-count').hidden=!active;$('download-count').textContent=active;
  $('downloads-list').replaceChildren();if(!downloadList.length)$('downloads-list').append(text('p','Загрузок пока нет.','empty-state'));
  for(const d of downloadList){const row=document.createElement('article');row.className='download-row';const title=text('strong',d.name);title.title=d.path||d.name;row.append(title);
    const status=({completed:'Готово',cancelled:'Отменено',interrupted:'Прервано'})[d.status]||(d.checking?'Проверка источника':d.paused?'На паузе':'Загружается');row.append(text('small',status+' · '+size(d.received)+(d.total?' / '+size(d.total):'')));
    if(d.scan?.message){const scan=text('p',d.scan.message,'download-scan');scan.dataset.state=d.scan.state;row.append(scan);}
    if(d.active){const progress=document.createElement('progress');progress.max=d.total||1;if(d.total)progress.value=d.received;row.append(progress);}
    const controls=document.createElement('div');controls.className='row-actions';const act=name=>action('downloads',{action:name,id:d.id});
    if(d.active){if(!d.checking)controls.append(button(d.paused||d.status==='interrupted'?'Продолжить':'Пауза','Приостановить или продолжить',()=>act('pause')));controls.append(button('Отменить','Отменить загрузку',()=>act('cancel')));}
    if(d.status==='completed'){const open=button('Открыть ↗','Открыть файл',()=>act('open'));open.disabled=['scanning','blocked','waiting'].includes(d.scan?.state);controls.append(open,button('В папке','Показать файл в папке',()=>act('reveal')),button('Проверить','Проверить файл Defender',()=>act('scan')));}
    if(!d.active)controls.append(button('×','Убрать из списка, сохранив файл',()=>act('remove')));row.append(controls);$('downloads-list').append(row);
  }
}
$('downloads-folder').onclick=()=>action('downloads',{action:'folder'});
apply();applyPreferences();renderQuickLinks();renderDownloads();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePanels();$('address').blur();}});
