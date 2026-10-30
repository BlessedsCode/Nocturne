// YouTube sends many ads inside first-party player responses, rather than as
// separately blockable requests. Keep this reviewed code local to the app.
// Field reference: https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt
(function(){
 const YOUTUBE_AD_CSS=`
ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-layout-renderer,
ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer,
ytd-action-companion-ad-renderer, ytd-companion-slot-renderer,
ytd-banner-promo-renderer, ytd-video-masthead-ad-v3-renderer,
ytm-promoted-sparkles-web-renderer, ytm-companion-ad-renderer,
#player-ads, #masthead-ad, .ytp-ad-overlay-container,
ytd-rich-item-renderer:has(ytd-ad-slot-renderer) { display:none !important; }
`;
 function installYouTubeFilter(eventName,initialEnabled=false){
  if(location.protocol!=='https:'||!['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname))return false;
  let enabled=false,epoch=0;
  const originals={parse:JSON.parse,fetch:window.fetch};
  const adKeys=new Set(['adPlacements','playerAds','adSlots','adBreakHeartbeatParams']);
  const adText=/"(?:adPlacements|playerAds|adSlots|adBreakHeartbeatParams)"\s*:/;
  // Operate on ad metadata only: never drop streamingData, captions, videoDetails
  // or playabilityStatus. Bound traversal even for unusually large responses.
  function prune(value){
   if(!enabled||!value||typeof value!=='object')return value;
   const stack=[value],seen=new WeakSet();let budget=6000;
   while(stack.length&&budget-->0){const object=stack.pop();if(!object||typeof object!=='object'||seen.has(object))continue;seen.add(object);
    for(const key of Object.keys(object)){if(adKeys.has(key)){try{delete object[key];}catch{}continue;}const child=object[key];if(child&&typeof child==='object'&&stack.length<6000)stack.push(child);}
   }
   return value;
  }
  function cleanText(text){
   if(!enabled||typeof text!=='string'||text.length>8000000||!adText.test(text))return text;
   try{return JSON.stringify(prune(Reflect.apply(originals.parse,JSON,[text])));}catch{return text;}
  }
  function playerEndpoint(value){try{const u=new URL(value,location.href);return u.origin===location.origin&&/^\/youtubei\/v1\/(player|get_watch)(?:\/|$)/.test(u.pathname);}catch{return false;}}
  const parse=new Proxy(originals.parse,{apply(target,thisArg,args){const result=Reflect.apply(target,thisArg,args);return enabled&&typeof args[0]==='string'&&args[0].length<=8000000&&adText.test(args[0])?prune(result):result;}});
  const responseCache=new WeakMap();
  function wrapResponse(response,atEpoch){
   if(responseCache.has(response))return responseCache.get(response);
   const active=()=>enabled&&epoch===atEpoch;
   const proxy=new Proxy(response,{get(target,key){
    if(key==='json')return async()=>{const value=await target.json();return active()?prune(value):value;};
    if(key==='text')return async()=>{const text=await target.text();return active()?cleanText(text):text;};
    if(key==='clone')return ()=>wrapResponse(target.clone(),atEpoch);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
   }});responseCache.set(response,proxy);return proxy;
  }
  const fetch=typeof originals.fetch==='function'?new Proxy(originals.fetch,{apply(target,thisArg,args){
   const atEpoch=epoch,filter=enabled&&playerEndpoint(typeof args[0]==='string'||args[0] instanceof URL?args[0]:args[0]?.url);
   return Reflect.apply(target,thisArg,args).then(response=>filter&&enabled&&epoch===atEpoch&&playerEndpoint(response.url)?wrapResponse(response,atEpoch):response);
  }}):null;
  const xhr=window.XMLHttpRequest?.prototype,open=xhr?.open,xhrState=new WeakMap(),xhrDescriptors={};
  const hookedGlobals=new Map();
  function hookGlobal(key){
   const descriptor=Object.getOwnPropertyDescriptor(window,key);
   if(descriptor&&(!descriptor.configurable||!('value'in descriptor)||descriptor.writable===false)){if(descriptor&&'value'in descriptor)prune(descriptor.value);return;}
   let value=descriptor?.value;if(enabled)prune(value);
   const getter=()=>value,setter=next=>{value=enabled?prune(next):next;};
   Object.defineProperty(window,key,{configurable:true,enumerable:descriptor?.enumerable??true,get:getter,set:setter});
   hookedGlobals.set(key,()=>{if(Object.getOwnPropertyDescriptor(window,key)?.get===getter){if(descriptor)Object.defineProperty(window,key,{...descriptor,value});else{delete window[key];if(value!==undefined)window[key]=value;}}});
  }
  function attach(){
   JSON.parse=parse;if(fetch)window.fetch=fetch;
   for(const key of ['ytInitialPlayerResponse','playerResponse'])hookGlobal(key);
   if(xhr&&open){
    xhr.open=function(method,url,...rest){xhrState.set(this,{filter:playerEndpoint(url),epoch});return Reflect.apply(open,this,[method,url,...rest]);};
    for(const key of ['response','responseText']){const descriptor=Object.getOwnPropertyDescriptor(xhr,key);if(!descriptor?.get||!descriptor.configurable)continue;xhrDescriptors[key]=descriptor;
     Object.defineProperty(xhr,key,{...descriptor,get(){const value=Reflect.apply(descriptor.get,this,[]),state=xhrState.get(this);
      if(!enabled||!state?.filter||state.epoch!==epoch||this.readyState!==4||!playerEndpoint(this.responseURL))return value;
      if(state.raw===value)return state.cleaned;
      state.raw=value;state.cleaned=typeof value==='string'?cleanText(value):this.responseType==='json'?prune(value):value;return state.cleaned;
     }});
    }
   }
  }
  function detach(){
   if(JSON.parse===parse)JSON.parse=originals.parse;if(fetch&&window.fetch===fetch)window.fetch=originals.fetch;
   for(const restore of hookedGlobals.values())restore();hookedGlobals.clear();
   if(xhr&&open){if(xhr.open===openWrapper)xhr.open=open;for(const [key,descriptor]of Object.entries(xhrDescriptors))if(Object.getOwnPropertyDescriptor(xhr,key)?.get===installedGetters[key])Object.defineProperty(xhr,key,descriptor);}
  }
  // Remember our exact wrappers, so disabling never overwrites a site's later hook.
  let openWrapper;const installedGetters={};
  function enable(){attach();openWrapper=xhr?.open;for(const key of Object.keys(xhrDescriptors))installedGetters[key]=Object.getOwnPropertyDescriptor(xhr,key)?.get;}
  function skip(){
   if(!enabled)return;const player=document.getElementById('movie_player');
   if(!player||!player.classList.contains('ad-showing')&&!player.classList.contains('ad-interrupting'))return;
   const button=player.querySelector('button.ytp-skip-ad-button,button.ytp-ad-skip-button,button.ytp-ad-skip-button-modern,.ytp-ad-skip-button-slot button');
   if(button&&!button.disabled&&button.getClientRects().length)button.click();
  }
  // Use native skip controls only. Never seek to the end of an ordinary video,
  // change volume/playback speed, or dismiss YouTube's login/anti-adblock dialogs.
  let observer=null,skipTimer=null,findTimer=null;
  function observePlayer(){if(!enabled)return;const player=document.getElementById('movie_player');if(!player)return;
   observer?.disconnect();observer=new MutationObserver(()=>{if(!skipTimer&&(player.classList.contains('ad-showing')||player.classList.contains('ad-interrupting')))skipTimer=setTimeout(()=>{skipTimer=null;skip();},100);});
   observer.observe(player,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});skip();
  }
  function stopObserver(){observer?.disconnect();observer=null;clearTimeout(skipTimer);skipTimer=null;clearTimeout(findTimer);findTimer=null;}
  function findPlayer(){stopObserver();if(!enabled)return;let attempts=0;function find(){findTimer=null;observePlayer();if(!observer&&++attempts<20)findTimer=setTimeout(find,250);}find();}
  document.addEventListener(eventName,event=>{
   const next=event.detail===true;if(next===enabled)return;enabled=next;epoch++;
   if(enabled){enable();findPlayer();}else{stopObserver();detach();}
  });
  document.addEventListener('yt-navigate-finish',findPlayer);
  document.addEventListener('DOMContentLoaded',findPlayer,{once:true});
  if(initialEnabled)document.dispatchEvent(new CustomEvent(eventName,{detail:true}));
  return true;
 }
 if(typeof process==='undefined'||process.type!=='renderer'){
  if(typeof module!=='undefined')module.exports={installYouTubeFilter,YOUTUBE_AD_CSS};return;
 }
 if(window!==window.top||location.protocol!=='https:'||!['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname))return;
 const {ipcRenderer,contextBridge}=require('electron');
 const eventName='nocturne-youtube-filter-'+crypto.randomUUID();let serial=0;
 // One small synchronous policy check at document start is deliberate: the
 // initial player response is consumed by inline scripts before DOMContentLoaded.
 // The main handler only checks in-memory preferences and the sender's origin.
 const initial=ipcRenderer.sendSync('content-filter-bootstrap');
 contextBridge.executeInMainWorld({func:installYouTubeFilter,args:[eventName,!!initial?.ads]});
 const setEnabled=value=>contextBridge.executeInMainWorld({func:(name,on)=>{document.dispatchEvent(new CustomEvent(name,{detail:on}));return true;},args:[eventName,value]});
 async function refresh(){const token=++serial;try{const config=await ipcRenderer.invoke('content-filter-config');if(token===serial)setEnabled(!!config.ads);}catch{if(token===serial)setEnabled(false);}}
 refresh();ipcRenderer.on('content-filter-settings',refresh);ipcRenderer.on('content-page-url',refresh);
 window.addEventListener('pagehide',()=>{serial++;setEnabled(false);});window.addEventListener('pageshow',refresh);
})();
