const {app, BrowserWindow, WebContentsView, webContents, ipcMain, session, Menu, dialog, safeStorage, shell, net, clipboard} = require('electron');
const {setupFavicons}=require('./favicons');
const {BrowserSecurity}=require('./security');
const fs = require('node:fs/promises');
const {Vault,decodeCSV} = require('./vault');
const {setupDownloads} = require('./downloads');
const {Profile} = require('./profile');
const {engines,searchURL}=require('../shared/search-engines');
const {CombinedSearch}=require('./combined-search');
const {AIAssistant}=require('./ai-assistant');
let aiAssistant;
const {translateEnglish}=require('./english-query');
const {discoverBrowsers,openBrowserExport,definitions:browserDefinitions}=require('./browser-import');
const {AutomaticImport}=require('./automatic-import');
const {AppUpdates}=require('./app-updates');
const {DefaultBrowser,externalURLs}=require('./default-browser');
const {createScanner,markDownloaded}=require('./defender');
const {SearchSuggestions,historySuggestions}=require('./suggestions');
const {ExtensionsManager}=require('./extensions');
const {AdBlock}=require('./adblock');
const {SponsorBlock,videoID}=require('./sponsorblock');
const {watchEdits,hasDiscardRisk,within}=require('./tab-safety');
const {liveContents,requestTab}=require('./tab-contents');
const searchSuggestions=new SearchSuggestions((...args)=>net.fetch(...args));
const path = require('node:path');
const {pathToFileURL}=require('node:url');
const {resolveAddress} = require('./navigation');
const {shortcutFor,contextTemplate}=require('./browser-controls');
const {safeFilename}=require('./download-names');
const rendererDirectory=path.join(__dirname,'..','renderer');
const preloadDirectory=path.join(__dirname,'..','preload');
const shellURL=pathToFileURL(path.join(rendererDirectory,'index.html')).href;
let win, active, overlay = false, nextId = 0, shuttingDown = false;
let profileRevealTimer, windowRevealTimer, memorySaverTimer, memorySaverRunning=false;
let profileIntroduction=false, windowRevealed=false, windowRevealPending=false;
let vault, downloads, profile, icons, security, combinedSearch;
let automaticImport;
let appUpdates;
let defaultBrowser,uiReady=false;
const pendingExternalURLs=externalURLs(process.argv);
let pendingDefaultSettings=process.argv.slice(1,process.argv.indexOf('--')<0?undefined:process.argv.indexOf('--')).includes('--default-browser-settings');
function openExternalIntents(){
 if(!uiReady||!win||win.isDestroyed())return;
 if(pendingExternalURLs.length){overlay=false;tell('close-panels');for(const url of pendingExternalURLs.splice(0)){const result=newTab(url,{background:false});if(result?.error){tell('toast',result.error);break;}}if(!windowRevealed)revealMainWindow();else{win.show();win.focus();}}
 if(pendingDefaultSettings){pendingDefaultSettings=false;defaultBrowser.open().catch(reportError);}
}
let extensionsManager;
let adBlock,sponsorBlock;
function refreshContentFilters(){for(const t of tabs.values())liveContents(t)?.send('content-filter-settings');}
app.enableSandbox();
app.setAppUserModelId('dev.nocturne.browser');
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
app.on('second-instance',(_event,argv)=>{pendingExternalURLs.push(...externalURLs(argv).slice(0,16-pendingExternalURLs.length));const end=argv.indexOf('--');if(argv.slice(1,end<0?undefined:end).includes('--default-browser-settings'))pendingDefaultSettings=true;openExternalIntents();if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();if(profileMode==='personal')tell('profile-enter');else if(!windowRevealed)revealMainWindow();else{win.show();win.focus();}}});
function revealWindow({from=0,duration=900,animate=true}={}){
 if(!win||win.isDestroyed())return;
 clearInterval(windowRevealTimer);
 const shouldAnimate=animate&&profile?.preferences?.animations!==false;
 windowRevealed=true;
 win.setOpacity(shouldAnimate?from:1);
 if(!win.isVisible())win.show();
 win.focus();
 if(!shouldAnimate)return;
 const started=Date.now();
 windowRevealTimer=setInterval(()=>{
  if(!win||win.isDestroyed()){clearInterval(windowRevealTimer);return;}
  const progress=Math.min(1,(Date.now()-started)/duration);
  const eased=1-Math.pow(1-progress,4);
  win.setOpacity(from+(1-from)*eased);
  if(progress===1){clearInterval(windowRevealTimer);win.setOpacity(1);}
 },16);
}
function revealMainWindow(){
 if(windowRevealed||windowRevealPending||profileMode==='personal'||!win||win.isDestroyed())return;
 windowRevealPending=true;
 Promise.resolve(win.webContents.executeJavaScript("(()=>{try{return JSON.parse(localStorage.getItem('preferences')||'{}').animations!==false;}catch{return true;}})()"))
  .then(value=>revealWindow({from:0,duration:950,animate:value!==false}))
  .catch(()=>revealWindow({from:0,duration:950}))
  .finally(()=>{windowRevealPending=false;});
}
function revealPersonalProfile(animate){
 if(profileMode!=='personal'||!win||win.isDestroyed())return;
 profileIntroduction=true;layout();
 revealWindow({from:0,duration:900,animate});
}
const tabs = new Map();
const closedTabs=[];let findTarget=null,findRequest=0,findText='';
const devtoolsHooks=new WeakSet();
let overlaySequence=0;
let stateScheduled=false;
function state(immediate=false) {
  if (!win || win.isDestroyed()) return;
  const send=()=>{
    stateScheduled=false;
    if (!win || win.isDestroyed()) return;
    const cur=current();
    const wc=liveContents(cur);
    win.webContents.send('state', {
      active,
      tabs:[...tabs.values()].map(t => ({
        id:t.id,
        title:t.title,
        url:t.url,
        favicon:t.favicon,
        loading:!!t.loading,
        sleeping:!!t.sleeping,
        restoring:!!t.restoring,
        neverDiscard:!!t.neverDiscard,
        error:t.error,
        security:t.security
      })),
      back: (!cur?.sleeping && wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()) || false,
      forward: (!cur?.sleeping && wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward()) || false
    });
  };
  if(immediate){
    stateScheduled=false;
    send();
  } else if(!stateScheduled){
    stateScheduled=true;
    setImmediate(send);
  }
}
function current() {return tabs.get(active);}
async function requestOverlay(visible){
 const token=++overlaySequence;
 if(!visible){overlay=false;win.webContents.send('overlay-background',{token,clear:true});layout();return;}
 if(overlay){layout();return;}
 const tab=current(),wc=tab?.view?.webContents;
 // Hide the native page immediately. Capturing it for the translucent backdrop
 // can take a while on heavy sites; the panel must never open behind the page.
 overlay=true;layout();
 if(!wc||wc.isDestroyed()||tab.error||tab.security)return;
 wc.capturePage().then(image=>image.toDataURL()).then(image=>{
   if(token!==overlaySequence||current()!==tab||win.isDestroyed()||!overlay)return;
   win.webContents.send('overlay-background',{token,image,hasSite:true});
 }).catch(()=>{});
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
 if(action==='close-tab'){overlay=false;tell('close-panels');return await closeTab(active);}
 if(action==='reopen-tab'){if(closedTabs.length&&tabs.size<40){overlay=false;tell('close-panels');newTab(closedTabs.pop());}return;}
 if(['next-tab','previous-tab'].includes(action)||/^tab-[1-9]$/.test(action)){
  const ids=[...tabs.keys()],index=ids.indexOf(active);closePageFind(false);overlay=false;tell('close-panels');
  const prev=current();if(prev)prev.lastActiveAt=Date.now();
  active=action==='next-tab'?ids[(index+1)%ids.length]:action==='previous-tab'?ids[(index-1+ids.length)%ids.length]:action==='tab-9'?ids.at(-1):ids[Math.min(Number(action.slice(4))-1,ids.length-1)];
  const nextTab=tabs.get(active);
  if(nextTab){
    nextTab.lastActiveAt=Date.now();
    if(nextTab.sleeping||(!nextTab.view&&nextTab.url))wakeTab(nextTab);
  }
  layout();state();focusActiveTab();return;
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
    const contents=liveContents(t);if(!contents)continue;
    const visible=t.id === active && !overlay && !profileIntroduction && !t.error && !t.security;
    t.view.setVisible(visible);
    // Native child-view visibility is not always reflected by document.hidden.
    if(t.contentVisible!==visible){t.contentVisible=visible;contents.send('content-visibility',visible);}
    if(t.id === active && t.htmlFullScreen){
      t.view.setBounds({x:0,y:0,width,height});
    }else{
      t.view.setBounds({x:76,y:112,width:Math.max(1,width-88),height:Math.max(1,height-124)});
    }
  }
}
function attachTabWebContents(t, url, nativeOptions) {
  if (t.view) return t.view.webContents;
  t.view = new WebContentsView({
    ...(nativeOptions?.webContents?{webContents:nativeOptions.webContents}:{}),
    webPreferences: {
      ...nativeOptions?.webPreferences,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      safeDialogs: true,
      devTools: true,
      preload: path.join(preloadDirectory,'site-preload.js'),
      partition: 'persist:nocturne'
    }
  });
  win.contentView.addChildView(t.view);
  const attachedView=t.view;
  const wc = t.view.webContents;
  wc.once('destroyed',()=>{
    // window.close() from a native child must remove only that tab. Discard,
    // explicit tab closure and app shutdown have their own lifecycle handlers.
    if(!shuttingDown&&tabs.get(t.id)===t&&t.view===attachedView&&!t.sleeping&&!t.closing)finishCloseTab(t.id);
  });
  // Closing a native view is asynchronous; ignore its late events after replacement.
  const onContents = (event, listener) => wc.on(event, (...args) => {
    if (tabs.get(t.id) === t && t.view === attachedView && !wc.isDestroyed()) listener(...args);
  });
  onContents('dom-ready',()=>wc.executeJavaScriptInIsolatedWorld(998,[{code:'('+watchEdits.toString()+')()'}]).catch(()=>{}));
  wc.setZoomFactor(profile.preferences.zoom / 100);
  let popupTimes = [];
  wc.setWindowOpenHandler(({url, disposition}) => {
    popupTimes = popupTimes.filter(time => Date.now() - time < 60000);
    const isUserClick = disposition === 'background-tab' || disposition === 'foreground-tab';
    const blank=url==='about:blank'||url==='';
    if((!/^https?:\/\//i.test(url)&&!blank)||tabs.size>=40||(!isUserClick&&popupTimes.length>=30)){
      security.record(url,'popup');return {action:'deny'};
    }
    if(!isUserClick)popupTimes.push(Date.now());
    // Let Chromium create the real Window relationship. Manually loadURL'ing a
    // replacement tab loses window.opener, postMessage, POST bodies and referrers.
    return {action:'allow',outlivesOpener:true,overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,preload:path.join(preloadDirectory,'site-preload.js'),partition:'persist:nocturne'}},createWindow:options=>{
      const child=newTab(url||'about:blank',{background:disposition==='background-tab',nativeOptions:options,openerId:t.id,authPopup:blank||disposition==='new-window'});
      return liveContents(tabs.get(child.id));
    }};
  });
  onContents('will-navigate', (event, targetUrl) => {
    if (!/^https?:\/\//i.test(targetUrl)&&!(t.openerId&&targetUrl==='about:blank')) event.preventDefault();
  });
  onContents('will-redirect', (event, targetUrl) => {
    if (!/^https?:\/\//i.test(targetUrl)&&!(t.openerId&&targetUrl==='about:blank')) event.preventDefault();
  });
  onContents('page-title-updated', (_event, title) => {
    t.title = title;
    state();
  });
  onContents('page-favicon-updated', (_event, icons) => {
    t.favicon = icons.find(icon => /^https?:\/\//i.test(icon)) || '';
    state();
  });
  onContents('did-start-loading', () => {
    t.loading = true;
    state();
  });
  onContents('did-start-navigation', (_event, _url, inPlace, main) => {
    if (main && !inPlace) {
      t.navigationEpoch=(t.navigationEpoch||0)+1;
      t.mediaProtected=false;
      t.error = null;
      t.security = null;
      layout();
      state();
    }
  });
  onContents('did-stop-loading', () => {
    t.loading = false;
    t.restoring = false;
    if (!t.security) profile.visit(t.url, t.title);
    if (t.scrollPosition) {
      const {x, y} = t.scrollPosition;
      t.scrollPosition=null;
      wc.executeJavaScript(`window.scrollTo(${Number(x)||0}, ${Number(y)||0})`).catch(() => {});
    }
    state();
  });
  onContents('did-navigate', (_event, navUrl) => {
    if (t.url && new URL(t.url).origin !== new URL(navUrl).origin) t.favicon = '';
    t.url = navUrl;
    // HTTP errors are loaded documents too: they may contain a site's access
    // check, sign-in instructions or recovery links. Only transport failures
    // belong on the browser's error page (did-fail-load below).
    t.error = null;
    layout();
    state();
  });
  onContents('did-navigate-in-page', (_event, inPageUrl, isMainFrame) => {
    if(isMainFrame===false)return;
    t.url = inPageUrl;
    wc.send('content-page-url');
    state();
  });
  onContents('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
    if (isMainFrame && code !== -3 && !t.security && !t.sleeping) {
      t.error = description;
      t.loading = false;
      t.restoring = false;
      layout();
      state();
    }
  });
  onContents('render-process-gone', (_event, details) => {
    if (shuttingDown || !tabs.has(t.id) || t.sleeping) return;
    t.loading = false;
    t.restoring = false;
    t.error = 'Процесс страницы завершён (' + details.reason + '). Обнови вкладку.';
    layout();
    state();
  });
  onContents('enter-html-full-screen', () => {
    t.htmlFullScreen = true;
    if (!win.isFullScreen()) win.setFullScreen(true);
    layout();
  });
  onContents('leave-html-full-screen', () => {
    t.htmlFullScreen = false;
    if (win.isFullScreen()) win.setFullScreen(false);
    layout();
  });
  attachBrowserControls(wc);
  return wc;
}
async function canDiscardTab(t) {
  if (!t || t.id === active) return false;
  if (!t.view || !t.url || !/^https?:\/\//i.test(t.url)) return false;
  if (t.sleeping || t.loading || t.htmlFullScreen || t.neverDiscard || t.closing || t.hasPostHistory) return false;
  if(t.authPopup||[...tabs.values()].some(child=>child.authPopup&&child.openerId===t.id))return false;
  try {
    const host = new URL(t.url).hostname.toLowerCase();
    const exceptions = Array.isArray(profile?.preferences?.discardExceptions) ? profile.preferences.discardExceptions : [];
    if (exceptions.some(ex => host === ex.toLowerCase() || host.endsWith('.' + ex.toLowerCase()))) return false;
  } catch {
    return false;
  }
  const wc = t.view.webContents;
  if (!wc || wc.isDestroyed()) return false;
  if (wc.isCurrentlyAudible()) return false;
  if (wc.isDevToolsOpened()) return false;
  if(t.mediaProtected||downloads?.snapshot().some(d=>d.active))return false;
  try {
    if(await within(wc.executeJavaScript('typeof window.onbeforeunload === "function"')))return false;
    const hasUnsavedOrMedia = await within(wc.executeJavaScriptInIsolatedWorld(998, [{
      code: '('+hasDiscardRisk.toString()+')()'
    }]));
    if (hasUnsavedOrMedia) return false;
  } catch {
    return false;
  }
  return true;
}
async function discardTab(t) {
  if(!t||t.discarding)return false;
  const view = t.view;
  if (!view) return false;
  const url=t.url,epoch=t.navigationEpoch,lastActiveAt=t.lastActiveAt;
  t.discarding=true;
  try{
  if (!(await canDiscardTab(t))) return false;
  try {
    const scroll = await within(view.webContents.executeJavaScriptInIsolatedWorld(998,[{code:'({x: window.scrollX, y: window.scrollY})'}]));
    if (scroll && typeof scroll.x === 'number') t.scrollPosition = scroll;
  } catch {return false;}
  try {
    const title = view.webContents.getTitle();
    if (title) t.title = title;
  } catch {}
  // Switching, navigating or closing while the renderer is being checked cancels discard.
  if(tabs.get(t.id)!==t||t.view!==view||t.id===active||t.loading||t.neverDiscard||t.url!==url||t.navigationEpoch!==epoch||t.lastActiveAt!==lastActiveAt)return false;
  if(!(await canDiscardTab(t)))return false;
  if(tabs.get(t.id)!==t||t.view!==view||t.id===active||t.loading||t.url!==url||t.navigationEpoch!==epoch||t.lastActiveAt!==lastActiveAt)return false;
  const history=view.webContents.navigationHistory;
  const entries=history.getAllEntries().map(entry=>({url:entry.url,title:entry.title.slice(0,240)}));
  if(!entries.length||entries.some(entry=>{try{const u=new URL(entry.url);return !['http:','https:'].includes(u.protocol)||!!u.username||!!u.password;}catch{return true;}}))return false;
  // Never copy Chromium pageState: it can include form values or POST state.
  t.savedNavigation={entries,index:history.getActiveIndex()};
  t.sleeping = true;
  t.view = null;
  t.loading = false;
  t.restoring = false;
  try {
    if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    view.webContents.close();
  } catch {}
  layout();
  state();
  return true;
  }finally{t.discarding=false;}
}
function wakeTab(t) {
  if (!t || !t.url || (!t.sleeping && t.view)) return;
  t.sleeping = false;
  t.restoring = true;
  t.loading = true;
  const wc = attachTabWebContents(t, t.url);
  const saved=t.savedNavigation,restoringURL=t.url;t.savedNavigation=null;
  if(saved)wc.navigationHistory.restore(saved).catch(()=>{if(!wc.isDestroyed()&&t.view?.webContents===wc&&t.restoring&&t.url===restoringURL&&!t.security){t.loading=false;t.restoring=false;t.error='Не удалось восстановить страницу. Обнови вкладку.';layout();state();}});
  else wc.loadURL(t.url).catch(() => {});
  layout();
  state();
}
function newTab(url, options = {}) {
  closePageFind(false);
  if(tabs.size>=40)return {error:'Открыто слишком много вкладок. Закрой ненужные.'};
  const previous=active;
  const inBackground=options.background??!!(url&&profile?.preferences.backgroundTabs);
  const t = {
    id:++nextId,
    title:'Новая вкладка',
    url:'',
    favicon:'',
    view:null,
    error:null,
    security:null,
    loading:false,
    sleeping:false,
    restoring:false,
    neverDiscard:false,
    lastActiveAt:Date.now(),
    scrollPosition:null,
    htmlFullScreen:false
  };
  tabs.set(t.id,t); active=t.id;
  if(options.nativeOptions){
    t.url=url;t.title=/^https?:/.test(url)?new URL(url).hostname:'Окно сайта';t.loading=true;t.openerId=options.openerId;t.authPopup=!!options.authPopup;
    attachTabWebContents(t,url,options.nativeOptions);layout();state();
  }
  else if(url&&options.lazy){t.url=url;t.title=options.metadata?.title||new URL(url).hostname;t.favicon=options.metadata?.favicon||'';t.neverDiscard=!!options.metadata?.neverDiscard;t.sleeping=true;layout();state();}
  else if(url){navigate(url);t.neverDiscard=!!options.metadata?.neverDiscard;}
  else {layout();state();}
  if(inBackground&&previous){active=previous;const p=tabs.get(previous);if(p)p.lastActiveAt=Date.now();layout();state();}
  if(!inBackground){focusActiveTab();if(!url)win.webContents.send('focus-address');}
  return {id:t.id};
}
function navigate(input) {
  let url;
  try {url=resolveAddress(input);} catch(e) {return {error:e.message};}
  const t=current(); if(!t)return;
  t.error=null;t.security=null;t.lastActiveAt=Date.now();t.scrollPosition=null;
  if(t.htmlFullScreen){
    t.htmlFullScreen=false;
    if(win&&!win.isDestroyed()&&win.isFullScreen())win.setFullScreen(false);
  }
  if(!url) {
    closePageFind(false);
    const view=t.view;t.view=null;t.sleeping=false;t.savedNavigation=null;t.hasPostHistory=false;t.url='';t.title='Новая вкладка';t.loading=false;t.favicon='';
    if(view){try{win.contentView.removeChildView(view);view.webContents.close();}catch{}}
    layout();state();return;
  }
  if(win.webContents.isDevToolsOpened())win.webContents.closeDevTools();
  t.sleeping=false;t.restoring=false;
  const wc=attachTabWebContents(t,url);
  if(t.url&&new URL(t.url).origin!==new URL(url).origin)t.favicon='';
  t.url=url;t.title=new URL(url).hostname;t.loading=true;
  wc.loadURL(url).catch(()=>{});layout();state();
}
function finishCloseTab(id){
  const t=tabs.get(id);if(!t)return;
  if(t.htmlFullScreen&&win&&!win.isDestroyed()&&win.isFullScreen())win.setFullScreen(false);
  closePageFind(false);
  closedTabs.push(t.url||'');
  if(closedTabs.length>20)closedTabs.shift();
  const ids=[...tabs.keys()],index=ids.indexOf(id),view=t.view;
  t.view=null;t.sleeping=false;
  tabs.delete(id);
  if(shuttingDown||!win||win.isDestroyed())return;
  if(active===id){
    active=tabs.has(t.openerId)?t.openerId:profile.preferences.closeToLeft?(ids[index-1]||ids[index+1]):(ids[index+1]||ids[index-1]);
    const nextTab=tabs.get(active);
    if(nextTab){
      nextTab.lastActiveAt=Date.now();
      if(nextTab.sleeping||!nextTab.view)wakeTab(nextTab);
    }
  }
  if(view){try{win.contentView.removeChildView(view);}catch{}}
  if(!tabs.size){
    // Like other browsers, closing the last tab closes the window (and quits).
    win.close();
    return;
  }
  layout();state();focusActiveTab();
}
async function closeTab(id){
 const t=tabs.get(id);if(!t)return false;if(t.closing)return t.closing;
 const wc=t.view?.webContents;
 if(!wc||wc.isDestroyed()){finishCloseTab(id);return true;}
 const closing=new Promise((resolve,reject)=>{
  let timer;
  const cleanup=()=>{clearTimeout(timer);wc.removeListener('will-prevent-unload',prevent);wc.removeListener('destroyed',destroyed);t.closing=null;};
  const destroyed=()=>{cleanup();finishCloseTab(id);resolve(true);};
  const prevent=event=>{
   let leave=false;try{leave=dialog.showMessageBoxSync(win,{type:'question',title:'Закрыть вкладку?',message:'Сайт просит подтвердить закрытие страницы.',detail:'Несохранённые изменения могут быть потеряны.',buttons:['Остаться','Закрыть вкладку'],defaultId:0,cancelId:0})===1;}catch{}
   if(leave)event.preventDefault();else{cleanup();resolve(false);}
  };
  wc.once('destroyed',destroyed);wc.on('will-prevent-unload',prevent);
  timer=setTimeout(()=>{
   if(wc.isDestroyed())return;
   let force=false;try{force=dialog.showMessageBoxSync(win,{type:'question',title:'Страница не отвечает',message:'Закрыть вкладку принудительно?',detail:'Несохранённые изменения могут быть потеряны.',buttons:['Подождать','Закрыть вкладку'],defaultId:0,cancelId:0})===1;}catch{}
   if(force&&!wc.isDestroyed()){wc.removeListener('will-prevent-unload',prevent);try{wc.close({waitForBeforeUnload:false});}catch(error){cleanup();reject(error);}}
  },10000);timer.unref?.();
  try{wc.close({waitForBeforeUnload:true});}catch(error){cleanup();reject(error);}
 });
 t.closing=closing;return closing;
}
app.whenReady().then(async()=>{
  defaultBrowser=new DefaultBrowser({app,shell});
  if(!ownsProfile)return;
  const accelerators=[['F12','devtools'],['Ctrl+Shift+I','devtools'],['Ctrl+Shift+J','console'],['Ctrl+Shift+C','inspect-picker'],['Ctrl+T','new-tab'],['Ctrl+W','close-tab'],['Ctrl+Shift+T','reopen-tab'],['Ctrl+Tab','next-tab'],['Ctrl+Shift+Tab','previous-tab'],['Ctrl+PageDown','next-tab'],['Ctrl+PageUp','previous-tab'],['Ctrl+L','address'],['Alt+D','address'],['F6','address'],['F5','reload'],['Ctrl+R','reload'],['Ctrl+F5','hard-reload'],['Ctrl+Shift+R','hard-reload'],['Ctrl+F','find'],['F3','find-next'],['Shift+F3','find-previous'],['Ctrl+H','history'],['Ctrl+J','downloads'],['Ctrl+D','bookmark'],['Ctrl+P','print'],['Ctrl+S','save-page'],['Ctrl+U','source'],['F11','fullscreen'],['Alt+Left','back'],['Alt+Right','forward'],['Alt+Home','home'],['Ctrl+Shift+Delete','privacy'],...Array.from({length:9},(_,index)=>['Ctrl+'+(index+1),'tab-'+(index+1)])];
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Браузер',submenu:accelerators.map(([accelerator,action])=>({label:action,accelerator,click:()=>setImmediate(()=>runBrowserAction(action).catch(reportError))}))}]));
  profile=new Profile(app.getPath('userData'));
  if(profileMode==='personal'&&!require('node:fs').existsSync(path.join(profileDirectory,'browser-settings.json')))profile.update({firstRunComplete:true,searchSuggestions:false,cloudProtection:false,doNotTrack:true,restoreSession:false});
  security=new BrowserSecurity({directory:path.join(app.getPath('userData'),'security'),getPreferences:()=>profile.preferences,fetch:(...args)=>net.fetch(...args),crypto:safeStorage,notify:status=>{if(win&&!win.isDestroyed())win.webContents.send('security-status',status);}});
  await security.initialize();
  aiAssistant=new AIAssistant({directory:app.getPath('userData'),crypto:safeStorage,fetch:(...args)=>net.fetch(...args),search:(query,signal)=>new Promise(resolve=>{
    const searchSession=session.fromPartition('ai-search');searchSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));searchSession.setPermissionCheckHandler(()=>false);
    let latest=[],finished=false;
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',finish);worker.cancel();resolve(latest);};
    const worker=new CombinedSearch({timeout:4500,createView:()=>new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'ai-search'}}),notify:data=>{latest=data.results.slice(0,8).map((row,i)=>({number:i+1,title:row.title,url:row.url,snippet:row.snippet}));if(data.done||latest.length>=6)finish();}});
    const timer=setTimeout(finish,14000);signal.addEventListener('abort',finish,{once:true});if(signal.aborted){finish();return;}worker.start({query,english:false});
  })});
  await aiAssistant.initialize();
  adBlock=new AdBlock({directory:path.join(app.getPath('userData'),'adblock'),getPreferences:()=>profile.preferences,fetch:(...args)=>net.fetch(...args)});
  await adBlock.initialize();
  sponsorBlock=new SponsorBlock({getPreferences:()=>profile.preferences,fetch:(...args)=>net.fetch(...args)});
  icons=setupFavicons({directory:app.getPath('userData'),fetch:(...args)=>security.secureFetch(...args)});
  vault=new Vault(app.getPath('userData'),safeStorage);
  automaticImport=new AutomaticImport({vault,notify:result=>{if(win&&!win.isDestroyed())win.webContents.send('password-import-progress',result);}});
  appUpdates=new AppUpdates({current:app.getVersion(),directory:path.join(app.getPath('userData'),'updates'),fetch:(...args)=>net.fetch(...args),scanner:createScanner(),markDownloaded,notify:status=>{if(win&&!win.isDestroyed())win.webContents.send('app-update',status);},launch:async(file,scan)=>{
    if(scan.state!=='clean'){const answer=await dialog.showMessageBox(win,{type:'warning',title:'Установщик не проверен Defender',message:'Контрольная сумма совпала, но Defender не подтвердил проверку. Открыть установщик?',buttons:['Отмена','Открыть'],defaultId:0,cancelId:0});if(answer.response!==1)return {canceled:true};}
    const error=await shell.openPath(file);if(error)throw new Error('Не удалось открыть установщик.');app.quit();return {started:true};
  }});
  const sites=session.fromPartition('persist:nocturne');
  sites.registerPreloadScript({type:'frame',filePath:path.join(preloadDirectory,'youtube-adblock.js')});
  sites.registerPreloadScript({type:'frame',filePath:path.join(preloadDirectory,'youtube-content.js')});
  const trustedContent=event=>event.sender.session===sites&&[...tabs.values()].some(t=>t.view?.webContents===event.sender);
  const contentFilterConfig=event=>{
    const tab=[...tabs.values()].find(t=>t.view?.webContents===event.sender);
    const frameURL=event.senderFrame?.url||'',topURL=event.senderFrame===event.sender.mainFrame?frameURL:event.sender.getURL();
    return {ads:!!(trustedContent(event)&&/^https?:\/\//i.test(frameURL)&&adBlock.enabled(topURL)&&adBlock.enabled(frameURL)),visible:!!tab?.contentVisible};
  };
  ipcMain.handle('content-filter-config',contentFilterConfig);
  ipcMain.handle('youtube-content-config',event=>{
    let allowed=false;try{const url=new URL(event.senderFrame?.url);allowed=trustedContent(event)&&event.senderFrame===event.sender.mainFrame&&url.protocol==='https:'&&['www.youtube.com','youtube.com','m.youtube.com'].includes(url.hostname);}catch{}
    if(!allowed)return {ytContentEnabled:false};
    return Object.fromEntries(Object.entries(profile.preferences).filter(([key])=>key.startsWith('ytContent')));
  });
  ipcMain.on('content-filter-bootstrap',event=>{event.returnValue=contentFilterConfig(event);});
  ipcMain.handle('content-cosmetics',(event,tokens)=>{
    if(!trustedContent(event)||!/^https?:\/\//i.test(event.senderFrame?.url||'')||!adBlock.enabled(event.sender.getURL()))return '';
    const clean=value=>Array.isArray(value)?value.slice(0,2000).filter(t=>typeof t==='string'&&t.length<=128):[];
    return adBlock.cosmetics(event.senderFrame.url,{classes:clean(tokens?.classes),ids:clean(tokens?.ids)});
  });
  ipcMain.handle('content-sponsor',async event=>{
    if(!trustedContent(event)||event.senderFrame!==event.sender.mainFrame||!videoID(event.senderFrame.url))return {enabled:false,segments:[]};
    const url=event.senderFrame.url;const segments=await sponsorBlock.segments(url);
    return {enabled:profile.preferences.sponsorBlock,segments};
  });
  ipcMain.on('content-sponsor-skipped',event=>{if(trustedContent(event)&&event.senderFrame===event.sender.mainFrame&&videoID(event.senderFrame.url)&&profile.preferences.sponsorBlock)sponsorBlock.skipped++;});
  sites.spellCheckerEnabled=profile.preferences.spellcheck;
  extensionsManager=new ExtensionsManager({directory:path.join(app.getPath('userData'),'extensions'),session:sites,fetch:(...args)=>net.fetch(...args)});
  await extensionsManager.initialize();
  downloads=setupDownloads({session:sites,app,shell,security,getPreferences:()=>profile.preferences,getWindow:()=>win,notify:list=>{if(win&&!win.isDestroyed())win.webContents.send('downloads',list);}});
  sites.webRequest.onBeforeRequest((details,callback)=>{
    // Session requests (favicons, workers, fetch) may have no owning WebContents.
    let requester=null;try{if(Number.isInteger(details.webContentsId)&&details.webContentsId>0)requester=webContents.fromId(details.webContentsId);}catch{}
    if(requester?.getType()==='remote'&&/^devtools:\/\/(devtools|theme)\//.test(details.url)){callback({cancel:false});return;}
    const t=requestTab(tabs.values(),details.webContentsId);
    const main=details.resourceType==='mainFrame';
    if(main&&t&&details.method!=='GET')t.hasPostHistory=true;
    security.check(details.url,{main,topURL:t?.url||'',cloud:main}).then(verdict=>{
      if(verdict){security.record(details.url,verdict.kind);if(main&&t){t.security={...verdict,url:details.url};t.url=details.url;t.loading=false;t.error=null;layout();state();}callback({cancel:true});}else if(adBlock.match(details,t?.url||details.referrer||'')){callback({cancel:true});}else callback({});
    }).catch(()=>{if(main&&t){t.security={kind:'check-error',message:'Не удалось завершить проверку адреса.',url:details.url};t.loading=false;layout();state();}callback({cancel:true});});
  });
  const grants=new Set();
  const originOf=value=>{try{return new URL(value).origin;}catch{return '';}};
  sites.setPermissionRequestHandler(async(wc,permission,callback,details)=>{
    if(!wc||wc.isDestroyed()||!details){callback(false);return;}
    if(permission==='media'){const tab=[...tabs.values()].find(t=>t.view?.webContents===wc);if(tab)tab.mediaProtected=true;}
    if(permission==='fullscreen'||permission==='pointerLock'||permission==='clipboard-sanitized-write'||permission==='clipboard-write'){callback(true);return;}
    const origin=originOf(details.requestingUrl||wc.getURL());const currentOrigin=originOf(wc.getURL());
    if(details.isMainFrame===false||!['media','notifications','geolocation'].includes(permission)||profile.preferences[permission]!=='ask'||!origin.startsWith('https://')||origin!==currentOrigin){callback(false);return;}
    try{const labels={media:'камере и микрофону',notifications:'уведомлениям',geolocation:'местоположению'};const result=await dialog.showMessageBox(win,{type:'question',title:'Разрешение сайта',message:`Разрешить ${origin} доступ к ${labels[permission]}?`,buttons:['Запретить','Разрешить на этот запуск'],defaultId:0,cancelId:0});const allow=result.response===1&&!wc.isDestroyed()&&originOf(wc.getURL())===origin;if(allow)grants.add(origin+'|'+permission);callback(allow);}catch{callback(false);}
  });
  sites.setPermissionCheckHandler((_wc,permission,origin)=>{
    if(permission==='fullscreen'||permission==='pointerLock'||permission==='clipboard-sanitized-write'||permission==='clipboard-write')return true;
    return profile.preferences[permission]==='ask'&&grants.has(originOf(origin)+'|'+permission);
  });
  sites.webRequest.onBeforeSendHeaders((details,callback)=>{if(profile.preferences.doNotTrack)details.requestHeaders.DNT='1';callback({requestHeaders:details.requestHeaders});});
  win=new BrowserWindow({width:1480,height:960,minWidth:1000,minHeight:700,show:false,frame:false,icon:path.join(__dirname,'..','..','assets','icon.ico'),backgroundColor:'#111114',title:'Nocturne',webPreferences:{preload:path.join(preloadDirectory,'preload.js'),additionalArguments:['--nocturne-profile='+profileMode],contextIsolation:true,nodeIntegration:false,sandbox:true}});
  if(profileMode==='personal')win.once('ready-to-show',()=>tell('profile-enter'));
  else{const revealFallback=setTimeout(()=>{if(!windowRevealed)revealWindow({animate:false});},4000);revealFallback.unref?.();}
  win.setMenuBarVisibility(false);
  combinedSearch=new CombinedSearch({translate:(query,signal)=>translateEnglish(query,(...args)=>net.fetch(...args),signal),createView:()=>new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:nocturne'}}),notify:data=>{if(win&&!win.isDestroyed())win.webContents.send('combined-search',data);}});
  win.loadFile(path.join(rendererDirectory,'index.html'));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url)){newTab(url);return {action:'deny'};}return {action:'deny'};});
  attachBrowserControls(win.webContents,true);
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('did-finish-load',()=>{
    uiReady=true;
    profileIntroduction=false;
    requestOverlay(false);
    if(tabs.size){openExternalIntents();layout();state();revealMainWindow();return;}
    const restore=profile.preferences.restoreSession?profile.sessionState:{tabs:[],active:0};
    for(let i=0;i<restore.tabs.length;i++){
      const entry=restore.tabs[i];
      newTab(entry.url,{background:i!==restore.active,lazy:profile.preferences.memorySaver&&i!==restore.active,metadata:entry});
    }
    openExternalIntents();
    if(!tabs.size)newTab();
    revealMainWindow();
  });
  win.on('resize',layout);
  win.on('leave-full-screen',()=>{
    for(const t of tabs.values()){
      if(t.htmlFullScreen){
        t.htmlFullScreen=false;
        t.view?.webContents.executeJavaScript('if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})');
      }
    }
    layout();
  });
  win.on('close',()=>{
    shuttingDown=true;
    combinedSearch?.cancel();aiAssistant?.cancel();
    for(const child of win.getChildWindows())child.destroy();
    const savedTabs=[...tabs.values()];profile.write('tabs.json',{version:2,active:savedTabs.findIndex(t=>t.id===active),tabs:savedTabs.map(t=>({url:t.url,title:t.title,favicon:t.favicon||'',neverDiscard:!!t.neverDiscard}))});
    profile.flush();
    icons.flush?.();
  });
  win.on('closed',()=>{
    clearInterval(profileRevealTimer);
    if(memorySaverTimer) clearInterval(memorySaverTimer);
    combinedSearch?.cancel();aiAssistant?.cancel();
    for(const t of tabs.values())liveContents(t)?.close();
    tabs.clear();
  });
  if(Object.values(security.lists).some(list=>Date.now()-list.updated>8*3600000))security.update().catch(()=>{});
  const securityTimer=setInterval(()=>security.update().catch(()=>{}),8*3600000);securityTimer.unref();
  memorySaverTimer=setInterval(async()=>{
    if(memorySaverRunning||shuttingDown||!win||win.isDestroyed())return;
    if(!profile?.preferences?.memorySaver)return;
    memorySaverRunning=true;
    try{
    const timeoutMs=(profile.preferences.discardTimeoutMinutes||30)*60*1000;
    const now=Date.now();
    for(const t of [...tabs.values()]){
      if(shuttingDown||!profile.preferences.memorySaver)break;
      if(t.id===active||t.sleeping||!t.view)continue;
      if(t.lastActiveAt&&(now-t.lastActiveAt>=timeoutMs)){
        await discardTab(t).catch(()=>{});
      }
    }
    }finally{memorySaverRunning=false;}
  },25000);
  memorySaverTimer.unref?.();
  ipcMain.handle('command',async(event,action,value)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==shellURL)return;
    try {
    const wc=current()?.view?.webContents;
    if(action==='app-update-status')return appUpdates.status();
    if(action==='default-browser-status')return await defaultBrowser.status();
    if(action==='default-browser-open')return await defaultBrowser.open();
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
    if(action==='security-status')return {...security.status(),contentFilters:{ads:adBlock.status(),sponsors:sponsorBlock.status()},defender:downloads.scannerStatus(),runtime:{version:process.versions.electron,packaged:app.isPackaged,autoUpdates:false}};
    if(action==='adblock-update'){const result=await adBlock.update();refreshContentFilters();return result;}
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
    if(action==='security-exception'){const exceptions=security.exception(value?.host,!!value?.remove);profile.preferences.trackingExceptions=exceptions;profile.write('browser-settings.json',profile.preferences);refreshContentFilters();return exceptions;}
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
    if(action==='settings-update'){const updated=profile.update(value);sites.spellCheckerEnabled=updated.spellcheck;grants.clear();for(const t of tabs.values())liveContents(t)?.setZoomFactor(updated.zoom/100);if(Object.keys(value||{}).some(key=>['adBlock','sponsorBlock'].includes(key)||key.startsWith('ytContent')))refreshContentFilters();return updated;}
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
    if(action==='extensions-list')return {installed:extensionsManager.listInstalled(),catalog:await extensionsManager.search('')};
    if(action==='extensions-search')return await extensionsManager.search(value);
    if(action==='extensions-install')return await extensionsManager.install(value);
    if(action==='extensions-toggle')return await extensionsManager.toggle(value?.id,value?.enabled);
    if(action==='extensions-remove')return await extensionsManager.remove(value);
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
    if(action==='ai-copy'){if(typeof value!=='string'||value.length>32000)throw new Error('Слишком большой текст для копирования.');clipboard.writeText(value);return true;}
    if(action==='ai-status')return aiAssistant.status();
    if(action==='ai-key')return await aiAssistant.setKey(value);
    if(action==='ai-ask')return await aiAssistant.ask(value);
    if(action==='ai-cancel'){aiAssistant.cancel();return {cancelled:true};}
    if(action==='ai-get-key'){await shell.openExternal('https://aistudio.google.com/api-keys');return {};}
    if(action==='search-all')return combinedSearch.start(value);
    if(action==='search-all-cancel'){combinedSearch.cancel();return {cancelled:true};}
    if(action==='set-search-engine'){if(!engines.some(engine=>engine.id===value))throw new Error('Неизвестный поисковик.');if(profile.preferences.searchEngine!==value)profile.update({searchEngine:value});return {saved:true};}
    if(action==='browser-action')return await runBrowserAction(value);
    if(action==='page-find')return performFind(value);
    if(action==='page-find-close'){closePageFind();return;}
    if(action==='navigate')return navigate(value);
    if(action==='open-tab'&&typeof value==='string'&&/^https?:\/\//i.test(value))return newTab(value);
    if(action==='new')newTab();
    if(action==='tab-context-menu'){
      const t=tabs.get(typeof value==='object'?value?.id:value);
      if(!t)return;
      const isSleeping=!!t.sleeping;
      const isNeverDiscard=!!t.neverDiscard;
      const isCurrent=t.id===active;
      let host='';
      try{if(t.url)host=new URL(t.url).hostname;}catch{}
      const exceptions=Array.isArray(profile.preferences.discardExceptions)?profile.preferences.discardExceptions:[];
      const isDomainExcluded=!!(host&&exceptions.some(ex=>host===ex.toLowerCase()||host.endsWith('.'+ex.toLowerCase())));

      const template=[
        {
          label:'Обновить вкладку',
          enabled:!isSleeping&&!!t.view,
          click:()=>{
            if(t.view)t.view.webContents.reload();
            else if(t.url)wakeTab(t);
          }
        },
        {
          label:'Дублировать',
          enabled:!!t.url,
          click:()=>newTab(t.url)
        },
        {type:'separator'},
        isSleeping?{
          label:'Пробудить вкладку',
          click:()=>wakeTab(t)
        }:{
          label:'Усыпить вкладку',
          enabled:!isCurrent&&!!t.view&&!t.loading,
          click:()=>discardTab(t).catch(reportError)
        },
        {
          label:'Никогда не усыплять эту вкладку',
          type:'checkbox',
          checked:isNeverDiscard,
          click:()=>{
            t.neverDiscard=!t.neverDiscard;
            state();
          }
        }
      ];

      if(host){
        template.push({
          label:isDomainExcluded?('Удалить '+host+' из исключений сна'):('Никогда не усыплять '+host),
          click:()=>{
            let list=[...exceptions];
            if(isDomainExcluded){
              list=list.filter(ex=>ex.toLowerCase()!==host.toLowerCase()&&!host.endsWith('.'+ex.toLowerCase()));
            }else{
              list.push(host);
            }
            profile.update({discardExceptions:list});
            state();
          }
        });
      }

      template.push(
        {type:'separator'},
        {
          label:'Закрыть вкладку',
          click:()=>closeTab(t.id).catch(reportError)
        },
        {
          label:'Закрыть другие вкладки',
          enabled:tabs.size>1,
          click:async()=>{
            for(const other of [...tabs.values()]){
              if(other.id!==t.id&&!await closeTab(other.id))break;
            }
          }
        }
      );

      Menu.buildFromTemplate(template).popup({window:win});
      return;
    }
    if(action==='tab-discard'&&tabs.has(value)){
      return await discardTab(tabs.get(value));
    }
    if(action==='tab-wake'&&tabs.has(value)){
      wakeTab(tabs.get(value));
      return {woken:true};
    }
    if(action==='switch'&&tabs.has(value)){
      closePageFind(false);
      const prev=current();
      if(prev){
        prev.lastActiveAt=Date.now();
        if(prev.htmlFullScreen&&prev.id!==value){
          prev.htmlFullScreen=false;
          prev.view?.webContents.executeJavaScript('if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})');
          if(win&&!win.isDestroyed()&&win.isFullScreen())win.setFullScreen(false);
        }
      }
      active=value;
      const target=tabs.get(value);
      if(target){
        target.lastActiveAt=Date.now();
        if(target.sleeping||(!target.view&&target.url)){
          wakeTab(target);
        }
      }
      layout();state();focusActiveTab();
    }
    if(action==='close-tab')return await closeTab(value);
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
