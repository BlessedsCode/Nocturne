const {app, BrowserWindow, WebContentsView, webContents, ipcMain, session, Menu, dialog, safeStorage, shell, net, clipboard} = require('electron');
const {setupFavicons}=require('./favicons');
const {BrowserSecurity}=require('./security');
const fs = require('node:fs/promises');
const {Vault,decodeCSV} = require('./vault');
const {setupDownloads} = require('./downloads');
const {Profile} = require('./profile');
const {engines,searchURL}=require('./search-engines');
const {CombinedSearch}=require('./combined-search');
const {translateEnglish}=require('./english-query');
const {discoverBrowsers,openBrowserExport,definitions:browserDefinitions}=require('./browser-import');
const {AutomaticImport}=require('./automatic-import');
const {AppUpdates}=require('./app-updates');
const {createScanner,markDownloaded}=require('./defender');
const {SearchSuggestions,historySuggestions}=require('./suggestions');
const searchSuggestions=new SearchSuggestions((...args)=>net.fetch(...args));
const path = require('node:path');
const {pathToFileURL}=require('node:url');
const {resolveAddress} = require('./navigation');
const {shortcutFor,contextTemplate}=require('./browser-controls');
const {safeFilename}=require('./download-names');
const shellURL=pathToFileURL(path.join(__dirname,'index.html')).href;
let win, active, overlay = false, nextId = 0, shuttingDown = false;
let profileRevealTimer;
let profileIntroduction=false;
let vault, downloads, profile, icons, security, combinedSearch;
let automaticImport;
let appUpdates;
app.enableSandbox();
app.commandLine.appendSwitch('site-per-process');
if(app.isPackaged){
  if(!app.commandLine.hasSwitch('user-data-dir'))app.setPath('userData',path.join(app.getPath('appData'),'NocturneSecure'));
  for(const flag of ['remote-debugging-port','remote-debugging-pipe','inspect','inspect-brk','no-sandbox','disable-web-security','ignore-certificate-errors','allow-running-insecure-content','disable-site-isolation-trials'])app.commandLine.removeSwitch(flag);
}
const profileMode=app.commandLine.getSwitchValue('nocturne-profile')==='personal'?'personal':'main';
const profileRoot=path.resolve(app.commandLine.getSwitchValue('nocturne-root')||app.getPath('userData'));
const profileDirectory=profileMode==='personal'?path.join(profileRoot,'profiles','personal'):profileRoot;
app.setPath('userData',profileDirectory);
app.setPath('sessionData',profileDirectory);
const ownsProfile=app.requestSingleInstanceLock();
if(!ownsProfile)app.quit();
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();if(profileMode==='personal')tell('profile-enter');else{win.show();win.focus();}}});
function revealPersonalProfile(animate){
 if(profileMode!=='personal'||!win||win.isDestroyed())return;
 profileIntroduction=true;layout();
 clearInterval(profileRevealTimer);win.setOpacity(animate ? 0.12 : 1);win.show();win.focus();if(!animate)return;
 const start=Date.now();profileRevealTimer=setInterval(()=>{
  if(!win||win.isDestroyed()){clearInterval(profileRevealTimer);return;}
  const progress=Math.min(1,(Date.now()-start)/520);win.setOpacity(.12+.88*(1-Math.pow(1-progress,3)));
  if(progress===1)clearInterval(profileRevealTimer);
 },16);
}
const tabs = new Map();
const closedTabs=[];let findTarget=null,findRequest=0,findText='';
const devtoolsHooks=new WeakSet();
let overlaySequence=0;
function state() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('state', {active, tabs:[...tabs.values()].map(t => ({id:t.id,title:t.title,url:t.url,favicon:t.favicon,loading:t.loading,error:t.error,security:t.security})), back: current()?.view?.webContents.navigationHistory.canGoBack() || false, forward: current()?.view?.webContents.navigationHistory.canGoForward() || false});
}
function current() {return tabs.get(active);}
async function requestOverlay(visible){
 const token=++overlaySequence;
 if(!visible){overlay=false;win.webContents.send('overlay-background',{token,clear:true});layout();return;}
 if(overlay)return;
 const tab=current(),wc=tab?.view?.webContents;
 if(wc&&!wc.isDestroyed()&&!tab.error&&!tab.security){
  let image='';try{image=(await wc.capturePage()).toDataURL();}catch{}
  if(token!==overlaySequence||current()!==tab||win.isDestroyed())return;
  win.webContents.send('overlay-background',{token,image,hasSite:true});
  return;
 }
 overlay=true;layout();
}
function pageContents(){const wc=current()?.view?.webContents;return wc&&!wc.isDestroyed()?wc:win.webContents;}
function focusActiveTab(){const tab=current();const wc=!tab?.error&&!tab?.security?tab?.view?.webContents:null;(wc&&!wc.isDestroyed()?wc:win.webContents).focus();}
function tell(action,message){if(win&&!win.isDestroyed())win.webContents.send('browser-action',message?{action,message}:action);}
function reportError(error){tell('toast',error.message||'Не удалось выполнить действие.');}
function closePageFind(focus=true){
 const wc=findTarget;findTarget=null;
 if(wc&&!wc.isDestroyed()){wc.stopFindInPage('clearSelection');if(focus)wc.focus();}
 if(win&&!win.isDestroyed())tell('close-find');
}
function performFind(value){
 const wc=findTarget;if(!wc||wc.isDestroyed())return;
 const text=typeof value?.text==='string'?value.text.slice(0,500):'';findText=text;
 if(!text){wc.stopFindInPage('clearSelection');win.webContents.send('page-find-result',{matches:0,activeMatchOrdinal:0});return;}
 findRequest=wc.findInPage(text,{forward:value.forward!==false,findNext:!!value.findNext});
}
function showDevTools(wc,kind='devtools'){
 if(wc.isDevToolsOpened()&&kind==='devtools'){wc.closeDevTools();return;}
 const selectPanel=()=>{const tools=wc.devToolsWebContents;if(!tools||tools.isDestroyed())return;
  if(kind==='console')tools.executeJavaScript('DevToolsAPI.showPanel("console")').catch(()=>{});
  if(kind==='inspect-picker')tools.executeJavaScript('typeof DevToolsAPI.enterInspectElementMode === "function" ? DevToolsAPI.enterInspectElementMode() : DevToolsAPI.showPanel("elements")').catch(()=>{});
 };
 if(!wc.isDevToolsOpened())wc.once('devtools-opened',selectPanel);else selectPanel();
 wc.openDevTools({mode:'right',activate:true});
}
async function saveScreenshot(wc){
 const selected=await dialog.showSaveDialog(win,{title:'Сохранить снимок видимой страницы',defaultPath:path.join(app.getPath('pictures'),'Nocturne-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png'),filters:[{name:'PNG',extensions:['png']}]});
 if(selected.canceled||!selected.filePath||wc.isDestroyed())return;
 const image=await wc.capturePage();await fs.writeFile(selected.filePath,image.toPNG());tell('toast','Снимок сохранён');
}
async function saveWebPage(wc){
 const name=safeFilename((wc.getTitle()||'Страница').slice(0,90))+'.html';
 const selected=await dialog.showSaveDialog(win,{title:'Сохранить страницу',defaultPath:path.join(app.getPath('downloads'),name),filters:[{name:'Веб-страница HTML',extensions:['html']}]});
 if(selected.canceled||!selected.filePath||wc.isDestroyed())return;
 await wc.savePage(selected.filePath,'HTMLComplete');tell('toast','Страница сохранена');
}
async function showSource(wc){
 const source=await wc.executeJavaScriptInIsolatedWorld(997,[{code:'document.documentElement.outerHTML.slice(0,5000000)'}]);
 const escaped=String(source).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const viewer=new BrowserWindow({parent:win,width:1100,height:800,title:'Исходный код — '+wc.getTitle(),autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 viewer.webContents.setWindowOpenHandler(()=>({action:'deny'}));viewer.webContents.on('will-navigate',event=>event.preventDefault());
 const html='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Исходный код</title><style>body{margin:24px;background:#191d18;color:#d5dfcb}pre{font:13px/1.65 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style><pre>'+escaped+'</pre>';
 await viewer.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
}
async function runBrowserAction(action){
 const wc=pageContents();
 if(action==='address'){win.webContents.focus();win.webContents.send('focus-address');return;}
 if(action==='new-tab'){overlay=false;tell('close-panels');newTab();return;}
 if(action==='close-tab'){overlay=false;tell('close-panels');closeTab(active);return;}
 if(action==='reopen-tab'){if(closedTabs.length&&tabs.size<40){overlay=false;tell('close-panels');newTab(closedTabs.pop());}return;}
 if(['next-tab','previous-tab'].includes(action)||/^tab-[1-9]$/.test(action)){
  const ids=[...tabs.keys()],index=ids.indexOf(active);closePageFind(false);overlay=false;tell('close-panels');
  active=action==='next-tab'?ids[(index+1)%ids.length]:action==='previous-tab'?ids[(index-1+ids.length)%ids.length]:action==='tab-9'?ids.at(-1):ids[Math.min(Number(action.slice(4))-1,ids.length-1)];layout();state();focusActiveTab();return;
 }
 if(action==='reload'){if(current()?.view)wc.reload();return;}
 if(action==='hard-reload'){if(current()?.view)wc.reloadIgnoringCache();return;}
 if(action==='back'){if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();return;}
 if(action==='forward'){if(wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();return;}
 if(action==='home'){overlay=false;tell('close-panels');navigate('');return;}
 if(action==='fullscreen'){win.setFullScreen(!win.isFullScreen());return;}
 if(['devtools','console','inspect-picker'].includes(action)){if(wc!==win.webContents){overlay=false;tell('close-panels');layout();}showDevTools(wc,action);return;}
 if(action==='find'){findTarget=wc;win.webContents.focus();tell('find');return;}
 if(action==='find-next'||action==='find-previous'){if(!findTarget||!findText){findTarget=wc;win.webContents.focus();tell('find');}else performFind({text:findText,findNext:true,forward:action==='find-next'});return;}
 if(['history','downloads','privacy'].includes(action)){closePageFind(false);win.webContents.focus();tell(action);return;}
 if(action==='bookmark'){tell('bookmark');return;}
 if(['zoom-in','zoom-out','zoom-reset'].includes(action)){const factor=action==='zoom-reset'?profile.preferences.zoom/100:Math.max(.25,Math.min(5,Math.round((wc.getZoomFactor()+(action==='zoom-in'?.1:-.1))*100)/100));wc.setZoomFactor(factor);tell('toast','Масштаб: '+Math.round(factor*100)+'%');return;}
 if(action==='print'){wc.print({silent:false,printBackground:true});return;}
 if(action==='save-page')return saveWebPage(wc);
 if(action==='screenshot')return saveScreenshot(wc);
 if(action==='source')return showSource(wc);
 throw new Error('Неизвестное действие браузера.');
}
function attachBrowserControls(wc,isShell=false){
 wc.on('devtools-opened',()=>{const tools=wc.devToolsWebContents;if(!tools||devtoolsHooks.has(tools))return;devtoolsHooks.add(tools);tools.on('before-input-event',(event,input)=>{if(shortcutFor(input)==='devtools'){event.preventDefault();setImmediate(()=>{if(!wc.isDestroyed())wc.closeDevTools();});}});});
 wc.on('before-input-event',(event,input)=>{
  const action=shortcutFor(input);
  if(action){event.preventDefault();setImmediate(()=>runBrowserAction(action).catch(reportError));return;}
  if(input.type==='keyDown'&&['escape','esc'].includes(String(input.key).toLowerCase())){
   if(findTarget){event.preventDefault();closePageFind();return;}
   tell('close-panels');
   if(!isShell&&wc.isLoading()){event.preventDefault();wc.stop();}
  }
 });
 wc.on('found-in-page',(_event,result)=>{if(wc===findTarget&&result.requestId===findRequest)win.webContents.send('page-find-result',{matches:result.matches,activeMatchOrdinal:result.activeMatchOrdinal});});
 wc.on('context-menu',(event,params)=>{
  // Pinned-link menus are owned by the shell renderer; native editing menus remain here.
  if(isShell&&!params.isEditable&&!params.selectionText&&!params.linkURL)return;
  event.preventDefault();
  const wrap=callback=>(...args)=>{if(wc.isDestroyed())return;Promise.resolve().then(()=>callback(...args)).catch(reportError);};
  const engine=engines.find(engine=>engine.id===profile.preferences.searchEngine)||engines[0];
  const actions={engineName:engine.name,edit:method=>wc[method](),replaceWord:word=>wc.replaceMisspelling(word),copy:value=>clipboard.writeText(value),
   openTab:wrap(url=>newTab(url)),openWindow:wrap(url=>newTab(url)),download:wrap(url=>wc.downloadURL(url)),copyImage:wrap((x,y)=>wc.copyImageAt(x,y)),
   search:wrap(text=>newTab(searchURL(engine.id,text.slice(0,1500)))),translate:wrap(async text=>{const translated=await translateEnglish(text,(...args)=>net.fetch(...args));await dialog.showMessageBox(win,{type:'info',title:'Перевод на английский',message:translated||text,buttons:['Закрыть','Копировать'],defaultId:0}).then(result=>{if(result.response===1)clipboard.writeText(translated||text);});}),
   back:()=>wc.navigationHistory.goBack(),forward:()=>wc.navigationHistory.goForward(),canBack:wc.navigationHistory.canGoBack(),canForward:wc.navigationHistory.canGoForward(),reload:()=>wc.reload(),
   print:wrap(()=>wc.print({silent:false,printBackground:true})),screenshot:wrap(()=>saveScreenshot(wc)),source:wrap(()=>showSource(wc)),inspect:wrap((x,y)=>wc.inspectElement(x,y))};
  Menu.buildFromTemplate(contextTemplate(params,actions)).popup({window:win});
 });
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width,height] = win.getContentSize();
  for (const t of tabs.values()) if(t.view) {
    t.view.setVisible(t.id === active && !overlay && !profileIntroduction && !t.error && !t.security);
    t.view.setBounds({x:76,y:112,width:Math.max(1,width-88),height:Math.max(1,height-124)});
  }
}
function newTab(url, options = {}) {
  closePageFind(false);
  if(tabs.size>=40)return {error:'Открыто слишком много вкладок. Закрой ненужные.'};
  const previous=active;
  const inBackground=!!(options.background||(url&&profile?.preferences.backgroundTabs));
  const t = {id:++nextId,title:'Новая вкладка',url:'',view:null,error:null};
  tabs.set(t.id,t); active=t.id;
  if(url) navigate(url); else {layout();state();}
  if(inBackground&&previous){active=previous;layout();state();}
  if(!inBackground){focusActiveTab();if(!url)win.webContents.send('focus-address');}
}
function navigate(input) {
  let url;
  try {url=resolveAddress(input);} catch(e) {return {error:e.message};}
  const t=current(); if(!t)return;
  t.error=null;t.security=null;
  if(!url) {closePageFind(false);const view=t.view;t.view=null;t.url='';t.title='Новая вкладка';t.loading=false;t.favicon='';if(view){win.contentView.removeChildView(view);view.webContents.close();}layout();state();return;}
  if(win.webContents.isDevToolsOpened())win.webContents.closeDevTools();
  if(!t.view) {
    t.view=new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,safeDialogs:true,devTools:true,partition:'persist:nocturne'}});
    win.contentView.addChildView(t.view);
    const wc=t.view.webContents;
    wc.setZoomFactor(profile.preferences.zoom/100);
    let popupTimes=[];
    wc.setWindowOpenHandler(({url,disposition})=>{
      popupTimes=popupTimes.filter(time=>Date.now()-time<60000);
      const isUserClick=disposition==='background-tab'||disposition==='new-window'||disposition==='foreground-tab';
      if(/^https?:\/\//i.test(url)&&(isUserClick||popupTimes.length<30)){
        if(!isUserClick)popupTimes.push(Date.now());
        newTab(url,{background:disposition==='background-tab'});
      }else security.record(url,'popup');
      return {action:'deny'};
    });
    wc.on('will-navigate',(event,url)=>{if(!/^https?:\/\//i.test(url))event.preventDefault();});
    wc.on('will-redirect',(event,url)=>{if(!/^https?:\/\//i.test(url))event.preventDefault();});
    wc.on('page-title-updated',(_event,title)=>{t.title=title;state();});
    wc.on('page-favicon-updated',(_event,icons)=>{t.favicon=icons.find(icon=>/^https?:\/\//i.test(icon))||'';state();});
    wc.on('did-start-loading',()=>{t.loading=true;state();});
    wc.on('did-start-navigation',(_event,_url,inPlace,main)=>{if(main&&!inPlace){t.error=null;t.security=null;layout();state();}});
    wc.on('did-stop-loading',()=>{t.loading=false;if(!t.security)profile.visit(t.url,t.title);state();});
    wc.on('did-navigate',(_event,url,status)=>{if(t.url&&new URL(t.url).origin!==new URL(url).origin)t.favicon='';t.url=url;t.error=status>=400?'HTTP '+status:null;layout();state();});
    wc.on('did-navigate-in-page',(_event,url)=>{t.url=url;state();});
    wc.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3&&!t.security){t.error=description;t.loading=false;layout();state();}});
    wc.on('render-process-gone',(_event,details)=>{if(shuttingDown||!tabs.has(t.id))return;t.loading=false;t.error='Процесс страницы завершён ('+details.reason+'). Обнови вкладку.';layout();state();});
    attachBrowserControls(wc);
  }
  if(t.url&&new URL(t.url).origin!==new URL(url).origin)t.favicon='';
  t.url=url;t.title=new URL(url).hostname;t.loading=true;
  t.view.webContents.loadURL(url).catch(()=>{});layout();state();
}
function closeTab(id){const t=tabs.get(id);if(!t)return;closePageFind(false);closedTabs.push(t.url||'');if(closedTabs.length>20)closedTabs.shift();const ids=[...tabs.keys()],index=ids.indexOf(id),view=t.view;t.view=null;tabs.delete(id);if(active===id)active=profile.preferences.closeToLeft?(ids[index-1]||ids[index+1]):(ids[index+1]||ids[index-1]);if(view){win.contentView.removeChildView(view);view.webContents.close();}if(!tabs.size)newTab();layout();state();focusActiveTab();}
app.whenReady().then(async()=>{
  if(!ownsProfile)return;
  const accelerators=[['F12','devtools'],['Ctrl+Shift+I','devtools'],['Ctrl+Shift+J','console'],['Ctrl+Shift+C','inspect-picker'],['Ctrl+T','new-tab'],['Ctrl+W','close-tab'],['Ctrl+Shift+T','reopen-tab'],['Ctrl+Tab','next-tab'],['Ctrl+Shift+Tab','previous-tab'],['Ctrl+PageDown','next-tab'],['Ctrl+PageUp','previous-tab'],['Ctrl+L','address'],['Alt+D','address'],['F6','address'],['F5','reload'],['Ctrl+R','reload'],['Ctrl+F5','hard-reload'],['Ctrl+Shift+R','hard-reload'],['Ctrl+F','find'],['F3','find-next'],['Shift+F3','find-previous'],['Ctrl+H','history'],['Ctrl+J','downloads'],['Ctrl+D','bookmark'],['Ctrl+P','print'],['Ctrl+S','save-page'],['Ctrl+U','source'],['F11','fullscreen'],['Alt+Left','back'],['Alt+Right','forward'],['Alt+Home','home'],['Ctrl+Shift+Delete','privacy'],...Array.from({length:9},(_,index)=>['Ctrl+'+(index+1),'tab-'+(index+1)])];
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Браузер',submenu:accelerators.map(([accelerator,action])=>({label:action,accelerator,click:()=>setImmediate(()=>runBrowserAction(action).catch(reportError))}))}]));
  profile=new Profile(app.getPath('userData'));
  if(profileMode==='personal'&&!require('node:fs').existsSync(path.join(profileDirectory,'browser-settings.json')))profile.update({firstRunComplete:true,searchSuggestions:false,cloudProtection:false,doNotTrack:true,restoreSession:false});
  security=new BrowserSecurity({directory:path.join(app.getPath('userData'),'security'),getPreferences:()=>profile.preferences,fetch:(...args)=>net.fetch(...args),crypto:safeStorage,notify:status=>{if(win&&!win.isDestroyed())win.webContents.send('security-status',status);}});
  await security.initialize();
  icons=setupFavicons({directory:app.getPath('userData'),fetch:(...args)=>security.secureFetch(...args)});
  vault=new Vault(app.getPath('userData'),safeStorage);
  automaticImport=new AutomaticImport({vault,notify:result=>{if(win&&!win.isDestroyed())win.webContents.send('password-import-progress',result);}});
  appUpdates=new AppUpdates({current:app.getVersion(),directory:path.join(app.getPath('userData'),'updates'),fetch:(...args)=>net.fetch(...args),scanner:createScanner(),markDownloaded,notify:status=>{if(win&&!win.isDestroyed())win.webContents.send('app-update',status);},launch:async(file,scan)=>{
    if(scan.state!=='clean'){const answer=await dialog.showMessageBox(win,{type:'warning',title:'Установщик не проверен Defender',message:'Контрольная сумма совпала, но Defender не подтвердил проверку. Открыть установщик?',buttons:['Отмена','Открыть'],defaultId:0,cancelId:0});if(answer.response!==1)return {canceled:true};}
    const error=await shell.openPath(file);if(error)throw new Error('Не удалось открыть установщик.');app.quit();return {started:true};
  }});
  const sites=session.fromPartition('persist:nocturne');
  sites.spellCheckerEnabled=profile.preferences.spellcheck;
  downloads=setupDownloads({session:sites,app,shell,security,getPreferences:()=>profile.preferences,getWindow:()=>win,notify:list=>{if(win&&!win.isDestroyed())win.webContents.send('downloads',list);}});
  sites.webRequest.onBeforeRequest((details,callback)=>{
    // Session requests (favicons, workers, fetch) may have no owning WebContents.
    const requester=Number.isInteger(details.webContentsId)&&details.webContentsId>0?webContents.fromId(details.webContentsId):null;
    if(requester?.getType()==='remote'&&/^devtools:\/\/(devtools|theme)\//.test(details.url)){callback({cancel:false});return;}
    const t=[...tabs.values()].find(tab=>tab.view?.webContents.id===details.webContentsId);
    const main=details.resourceType==='mainFrame';
    security.check(details.url,{main,topURL:t?.url||'',cloud:main}).then(verdict=>{
      if(verdict){security.record(details.url,verdict.kind);if(main&&t){t.security={...verdict,url:details.url};t.url=details.url;t.loading=false;t.error=null;layout();state();}callback({cancel:true});}else callback({});
    }).catch(()=>{if(main&&t){t.security={kind:'check-error',message:'Не удалось завершить проверку адреса.',url:details.url};t.loading=false;layout();state();}callback({cancel:true});});
  });
  const grants=new Set();
  const originOf=value=>{try{return new URL(value).origin;}catch{return '';}};
  sites.setPermissionRequestHandler(async(wc,permission,callback,details)=>{
    if(!wc||wc.isDestroyed()||!details){callback(false);return;}
    if(permission==='clipboard-sanitized-write'||permission==='clipboard-write'){callback(true);return;}
    const origin=originOf(details.requestingUrl||wc.getURL());const currentOrigin=originOf(wc.getURL());
    if(details.isMainFrame===false||!['media','notifications','geolocation'].includes(permission)||profile.preferences[permission]!=='ask'||!origin.startsWith('https://')||origin!==currentOrigin){callback(false);return;}
    try{const labels={media:'камере и микрофону',notifications:'уведомлениям',geolocation:'местоположению'};const result=await dialog.showMessageBox(win,{type:'question',title:'Разрешение сайта',message:`Разрешить ${origin} доступ к ${labels[permission]}?`,buttons:['Запретить','Разрешить на этот запуск'],defaultId:0,cancelId:0});const allow=result.response===1&&!wc.isDestroyed()&&originOf(wc.getURL())===origin;if(allow)grants.add(origin+'|'+permission);callback(allow);}catch{callback(false);}
  });
  sites.setPermissionCheckHandler((_wc,permission,origin)=>{
    if(permission==='clipboard-sanitized-write'||permission==='clipboard-write')return true;
    return profile.preferences[permission]==='ask'&&grants.has(originOf(origin)+'|'+permission);
  });
  sites.webRequest.onBeforeSendHeaders((details,callback)=>{if(profile.preferences.doNotTrack)details.requestHeaders.DNT='1';callback({requestHeaders:details.requestHeaders});});
  win=new BrowserWindow({width:1480,height:960,minWidth:1000,minHeight:700,show:profileMode!=='personal',frame:false,backgroundColor:'#111114',title:'Nocturne',webPreferences:{preload:path.join(__dirname,'preload.js'),additionalArguments:['--nocturne-profile='+profileMode],contextIsolation:true,nodeIntegration:false,sandbox:true}});
  if(profileMode==='personal')win.once('ready-to-show',()=>tell('profile-enter'));
  win.setMenuBarVisibility(false);
  combinedSearch=new CombinedSearch({translate:(query,signal)=>translateEnglish(query,(...args)=>net.fetch(...args),signal),createView:()=>new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:nocturne'}}),notify:data=>{if(win&&!win.isDestroyed())win.webContents.send('combined-search',data);}});
  win.loadFile('index.html');
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url)){newTab(url);return {action:'deny'};}return {action:'deny'};});
  attachBrowserControls(win.webContents,true);
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('did-finish-load',()=>{profileIntroduction=false;requestOverlay(false);if(tabs.size){layout();state();return;}const restore=profile.preferences.restoreSession?profile.lastSession:[];for(const url of restore)if(/^https?:\/\//i.test(url))newTab(url);if(!tabs.size)newTab();});
  win.on('resize',layout);
  win.on('close',()=>{shuttingDown=true;combinedSearch?.cancel();for(const child of win.getChildWindows())child.destroy();profile.write('tabs.json',[...tabs.values()].map(t=>t.url).filter(Boolean));});
  win.on('closed',()=>{clearInterval(profileRevealTimer);combinedSearch?.cancel();for(const t of tabs.values())t.view?.webContents.close();tabs.clear();});
  if(Object.values(security.lists).some(list=>Date.now()-list.updated>8*3600000))security.update().catch(()=>{});
  const securityTimer=setInterval(()=>security.update().catch(()=>{}),8*3600000);securityTimer.unref();
  ipcMain.handle('command',async(event,action,value)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==shellURL)return;
    try {
    const wc=current()?.view?.webContents;
    if(action==='app-update-status')return appUpdates.status();
    if(action==='app-update-check')return await appUpdates.check();
    if(action==='app-update-download')return await appUpdates.download();
    if(action==='app-update-install')return await appUpdates.install();
    if(action==='profile-reveal'){revealPersonalProfile(value===true);return;}
    if(action==='profile-intro-complete'){profileIntroduction=false;layout();return;}
    if(action==='profile-open'){
      if(!['main','personal'].includes(value))throw new Error('Неизвестный профиль.');
      if(value===profileMode){win.focus();return {opened:true};}
      const target=value==='personal'?path.join(profileRoot,'profiles','personal'):profileRoot;
      const args=[...(app.isPackaged?[]:[app.getAppPath()]),'--nocturne-profile='+value,'--nocturne-root='+profileRoot,'--user-data-dir='+target];
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
      await new Promise((resolve,reject)=>{const child=require('node:child_process').spawn(process.execPath,args,{env,detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});return {opened:true};
    }
    if(action==='security-status')return {...security.status(),defender:downloads.scannerStatus(),runtime:{version:process.versions.electron,packaged:app.isPackaged,autoUpdates:false}};
    if(action==='security-update-lists')return security.update();
    if(action==='security-save-key'){await security.setKey(value);return {saved:true};}
    if(action==='security-test-connection'){
      if(value?.key)await security.setKey(value.key);
      const result=await security.testConnection();if(result.ok&&value?.enable)profile.update({cloudProtection:true});
      return {...result,enabled:profile.preferences.cloudProtection};
    }
    if(action==='security-open-help'){
      const links={console:'https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com',guide:'https://developers.google.com/safe-browsing/v4/get-started'};
      if(!links[value])throw new Error('Неизвестная ссылка.');await shell.openExternal(links[value]);return {opened:true};
    }
    if(action==='security-exception'){const exceptions=security.exception(value?.host,!!value?.remove);profile.preferences.trackingExceptions=exceptions;profile.write('browser-settings.json',profile.preferences);return exceptions;}
    if(action==='security-allow-http'){
      const t=current();if(t?.security?.kind!=='http')throw new Error('Нет HTTP-перехода для подтверждения.');const url=t.security.url;security.allowHTTP(url);return navigate(url);
    }
    if(action==='security-try-https'){const t=current();if(t?.security?.kind!=='http')return;const url=new URL(t.security.url);url.protocol='https:';return navigate(url.href);}
    if(action==='security-check-runtime'){
      try{const response=await net.fetch('https://registry.npmjs.org/electron/latest',{signal:AbortSignal.timeout(10000),credentials:'omit'});if(!response.ok)throw new Error();const metadata=await response.json();if(!/^\d+\.\d+\.\d+$/.test(metadata.version))throw new Error();return {current:process.versions.electron,latest:metadata.version,updateAvailable:metadata.version!==process.versions.electron};}catch{return {error:'Не удалось проверить версию Electron.'};}
    }
    if(action==='suggestion-backdrop'){
      if(!wc||wc.isDestroyed()||overlay)return '';
      try{return (await wc.capturePage()).toDataURL();}catch{return '';}
    }
    if(action==='favicon-get')return {icon:await icons.get(value)};
    if(action==='settings-get')return {...profile.preferences,downloadDirectory:profile.preferences.downloadDirectory||app.getPath('downloads'),versions:{app:app.getVersion(),chromium:process.versions.chrome,electron:process.versions.electron}};
    if(action==='settings-update'){const updated=profile.update(value);sites.spellCheckerEnabled=updated.spellcheck;grants.clear();for(const t of tabs.values())t.view?.webContents.setZoomFactor(updated.zoom/100);return updated;}
    if(action==='choose-download-directory'){const chosen=await dialog.showOpenDialog(win,{title:'Папка для загрузок',defaultPath:profile.preferences.downloadDirectory||app.getPath('downloads'),properties:['openDirectory','createDirectory']});if(chosen.canceled)return {canceled:true};profile.preferences.downloadDirectory=chosen.filePaths[0];profile.write('browser-settings.json',profile.preferences);return {directory:chosen.filePaths[0]};}
    if(action==='history-list')return profile.history;
    if(action==='history-delete'){
      if(value?.all){const answer=await dialog.showMessageBox(win,{type:'question',title:'Удалить историю этого профиля?',message:'Удалить всю историю текущего профиля?',detail:'История другого профиля, пароли и быстрые ссылки сохранятся.',buttons:['Отмена','Удалить'],defaultId:0,cancelId:0});if(answer.response!==1)return {canceled:true};}
      else if(!Array.isArray(value?.ids)||value.ids.some(id=>typeof id!=='string'))throw new Error('Выбери записи истории.');
      const deleted=profile.deleteHistory(value?.all?profile.history.map(entry=>entry.id):value.ids);return {deleted,history:profile.history};
    }
    if(action==='suggestion-dismiss'){if(typeof value!=='string')throw new Error('Не выбран сайт.');profile.dismissSuggestion(value);return {history:profile.history,recommended:historySuggestions(profile.recommendedHistory()),online:profile.preferences.searchSuggestions};}
    if(action==='suggestion-history')return {history:profile.history,recommended:historySuggestions(profile.recommendedHistory()),online:profile.preferences.searchSuggestions};
    if(action==='search-suggest')return searchSuggestions.get(value,profile.preferences.searchSuggestions);
    if(action==='clear-browsing-data'){
      const selected=value||{};if(!selected.cache&&!selected.cookies&&!selected.history)return {canceled:true};
      const confirm=await dialog.showMessageBox(win,{type:'question',title:'Удаление данных',message:'Удалить выбранные данные браузера?',detail:selected.cookies?'Удаление cookies и данных сайтов приведёт к выходу из аккаунтов. Пароли и избранное сохранятся.':'Пароли и избранное сохранятся.',buttons:['Отмена','Удалить'],defaultId:0,cancelId:0});if(confirm.response!==1)return {canceled:true};
      if(selected.cache)await sites.clearCache();if(selected.cookies)await sites.clearStorageData();if(selected.history){profile.history=[];profile.write('history.json',[]);}return {cleared:true};
    }
    if(action==='link-menu'&&typeof value?.id==='string'){
      const send=kind=>win.webContents.send('link-action',{id:value.id,kind});
      Menu.buildFromTemplate([{label:'Открыть в новой вкладке',click:()=>send('open')},{label:'Копировать адрес ссылки',click:()=>send('copy')},{type:'separator'},{label:'Открепить с главной',click:()=>send('home')},{label:'Открепить с боковой панели',click:()=>send('sidebar')},{label:'Изменить ссылку',click:()=>send('edit')},{type:'separator'},{label:'Удалить ссылку',click:()=>send('delete')}]).popup({window:win});return;
    }
    if(action==='downloads')return await downloads.command(value?.action,value?.id);
    if(action==='passwords-list')return await vault.list();
    if(action==='passwords-delete')return await vault.remove(value);
    if(action==='passwords-import'){
      const chosen=await dialog.showOpenDialog(win,{title:'Импорт паролей из CSV',filters:[{name:'CSV — экспорт паролей',extensions:['csv']}],properties:['openFile']});
      if(chosen.canceled)return {canceled:true};
      const file=chosen.filePaths[0];if((await fs.stat(file)).size>20*1024*1024)throw new Error('CSV слишком большой. Максимум 20 МБ.');
      return await vault.importCSV(decodeCSV(await fs.readFile(file)));
    }
    if(action==='passwords-fill'){
      const entry=await vault.get(value);
      if(!wc||wc.isDestroyed()||!entry)throw new Error('Открой страницу входа нужного сайта.');
      if(new URL(wc.getURL()).origin!==entry.origin||!entry.origin.startsWith('https://'))throw new Error('Пароль можно заполнить только на его сайте по HTTPS.');
      const result=await wc.executeJavaScriptInIsolatedWorld(999,[{code:`(()=>{
        const entry=${JSON.stringify(entry)};
        if(location.origin!==entry.origin||location.protocol!=='https:')return false;
        const fields=[...document.querySelectorAll('input[type=password]')].filter(e=>e.getClientRects().length&&!e.disabled&&e.autocomplete!=='new-password');
        const password=fields[0];if(!password)return false;
        const form=password.form||document;
        if(password.form&&new URL(password.form.action||location.href).origin!==entry.origin)return false;
        const user=[...form.querySelectorAll('input')].find(e=>e.getClientRects().length&&!e.disabled&&(e.autocomplete==='username'||e.type==='email'))||[...form.querySelectorAll('input[type=text]')].find(e=>e.getClientRects().length&&!e.disabled);
        const set=(field,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));};
        if(user)set(user,entry.username);set(password,entry.password);return true;
      })()`}]);
      if(!result)throw new Error('На странице нет подходящей формы входа. Пароль не заполнен.');
      overlay=false;layout();return {filled:true};
    }
    if(action==='browser-discover')return (await discoverBrowsers()).map(({id,name,steps})=>({id,name,steps}));
    if(action==='passwords-discover')return automaticImport.scan();
    if(action==='passwords-import-auto'){await vault.list();return await automaticImport.start(value);}
    if(action==='browser-open-export')return await openBrowserExport(value);
    if(action==='browser-select-export'){
      const chosen=await dialog.showOpenDialog(win,{title:'Выбери браузер (например zen.exe)',properties:['openFile'],filters:[{name:'Браузер',extensions:['exe']}]});if(chosen.canceled)return {canceled:true};
      const executable=chosen.filePaths[0],definition=browserDefinitions.find(browser=>browser.exe===path.basename(executable).toLowerCase());if(!definition)throw new Error('Выбери chrome.exe, msedge.exe, firefox.exe, zen.exe, brave.exe, vivaldi.exe, opera.exe или browser.exe.');
      return await openBrowserExport(definition.id,{executable});
    }
    if(action==='search-source-verify'){
      const run=combinedSearch.run,source=run?.sources.find(source=>source.id===value);
      if(!source)throw new Error('Сначала запусти общий поиск.');
      combinedSearch.cancel();
      const verification=new BrowserWindow({parent:win,width:1050,height:800,title:source.name+' — проверка доступа',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:nocturne'}});
      verification.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      verification.webContents.on('will-navigate',(event,url)=>{if(!/^https:\/\//i.test(url))event.preventDefault();});
      verification.on('closed',()=>{if(win&&!win.isDestroyed()&&!shuttingDown)win.webContents.send('search-source-closed',{query:run.query});});
      verification.loadURL(source.url).catch(()=>{});return {opened:true};
    }
    if(action==='search-all')return combinedSearch.start(value);
    if(action==='search-all-cancel'){combinedSearch.cancel();return {cancelled:true};}
    if(action==='set-search-engine'){if(!engines.some(engine=>engine.id===value))throw new Error('Неизвестный поисковик.');if(profile.preferences.searchEngine!==value)profile.update({searchEngine:value});return {saved:true};}
    if(action==='browser-action')return await runBrowserAction(value);
    if(action==='page-find')return performFind(value);
    if(action==='page-find-close'){closePageFind();return;}
    if(action==='navigate')return navigate(value);
    if(action==='open-tab'&&typeof value==='string'&&/^https?:\/\//i.test(value))return newTab(value);
    if(action==='new')newTab();
    if(action==='switch'&&tabs.has(value)){closePageFind(false);active=value;layout();state();focusActiveTab();}
    if(action==='close-tab')closeTab(value);
    if(action==='reorder-tabs'&&Array.isArray(value)){
      const reordered=new Map();
      for(const id of value){if(tabs.has(id))reordered.set(id,tabs.get(id));}
      for(const [id,tab] of tabs){if(!reordered.has(id))reordered.set(id,tab);}
      tabs.clear();
      for(const [id,tab] of reordered)tabs.set(id,tab);
      state();
      return {reordered:true};
    }
    if(action==='back'&&wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();
    if(action==='forward'&&wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();
    if(action==='reload'&&current()?.url)navigate(current().url);
    if(action==='overlay')return await requestOverlay(!!value);
    if(action==='overlay-ready'){if(value===overlaySequence){overlay=true;layout();}return;}
    if(action==='minimize')win.minimize();
    if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();
    if(action==='quit')win.close();
    }catch(e){return {error:e.message||'Не удалось выполнить действие.'};}
  });
});
app.on('window-all-closed',()=>app.quit());
