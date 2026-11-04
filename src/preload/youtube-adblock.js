// YouTube sends many ads inside first-party player responses, rather than as
// separately blockable requests. Keep this reviewed code local to the app.
// Field reference: https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt
(function(){
 const YOUTUBE_AD_CSS=`
ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-layout-renderer,
ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer,
ytd-action-companion-ad-renderer, ytd-companion-slot-renderer,
ytd-banner-promo-renderer, ytd-video-masthead-ad-v3-renderer,
ytm-promoted-sparkles-web-renderer, ytm-companion-ad-renderer,
#masthead-ad, .ytp-ad-overlay-container,
ytd-rich-item-renderer:has(ytd-ad-slot-renderer) { display:none !important; }
`;
 function installYouTubeFilter(eventName,initialEnabled=false){
  if(location.protocol!=='https:'||!['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname))return false;
  let enabled=false,epoch=0;
  const originals={parse:JSON.parse,stringify:JSON.stringify,fetch:window.fetch};
  let channelPlayback=false;
  let playbackMode='channel',recoveryTimer=null;
  const recoveryModes=['channel','lactmilli','yahi','inline'];
  const recoveredOverlays=new Map();
  function restoreRecoveredOverlays(){for(const [node,css] of recoveredOverlays)node.style.cssText=css;recoveredOverlays.clear();}
  function clearRecoveredGate(){
   if(!enabled||!channelPlayback)return;
   const player=document.getElementById('movie_player'),video=player?.querySelector?.('video');let response;
   try{response=player?.getPlayerResponse?.();}catch{return;}
   if(response?.playabilityStatus?.status!=='OK'||!video||video.paused||video.readyState<3||video.currentTime<0.5)return;
   let id;try{id=new URL(location.href).searchParams.get('v');}catch{return;}
   if(!recoveryAttempts.has(id)||response.videoDetails?.videoId!==id)return;
   // The stream really started. Only now retire the stale enforcement overlay;
   // hiding an error alone must never count as successful recovery.
   for(const message of document.querySelectorAll?.('yt-enforcement-message-view-model, ytd-enforcement-message-view-model')||[]){const node=message.closest?.('yt-playability-error-supported-renderers')||message;if(!recoveredOverlays.has(node)){recoveredOverlays.set(node,node.style.cssText);node.style.setProperty('display','none','important');}}
   document.querySelector?.('ytd-watch-flexy[player-unavailable]')?.removeAttribute('player-unavailable');
   document.removeEventListener('timeupdate',clearRecoveredGate,true);
  }
  let restorePlaybackContext=null;
  const recoveryAttempts=new Set();
  function readable(value){if(typeof value==='string')return value;if(!value||typeof value!=='object')return '';return [value.simpleText,value.text,typeof value.content==='string'?value.content:'',(value.runs||[]).map(r=>r.text||'').join(' ')].filter(v=>typeof v==='string').join(' ');}
  function playerMessage(status){
   const error=status?.errorScreen,renderer=error?.playerErrorMessageRenderer||error?.playerInterstitialRenderer,view=renderer?.content?.interstitialViewModel;
   const parts=[status?.reason,readable(renderer?.reason),readable(renderer?.subreason),readable(renderer?.title),readable(view?.title),readable(view?.description)];
   // New enforcement renderer nests attributed text in several view models.
   // Read display strings only; navigation commands are not user-facing reasons.
   const stack=[error?.enforcementMessageViewModel];let budget=300;
   while(stack.length&&budget-->0){const node=stack.pop();if(!node||typeof node!=='object')continue;for(const [key,value] of Object.entries(node)){if(/^(?:navigationEndpoint|command|commands|commandRuns|onTap|onClick|trackingParams|url|href)$/i.test(key))continue;if(typeof value==='string'&&/^(?:text|content|simpleText|title|description|reason|subreason)$/.test(key))parts.push(value);else if(value&&typeof value==='object')stack.push(value);}}
   return parts.filter(v=>typeof v==='string').join(' ').slice(0,16000);
  }
  function channelContext(){
   restorePlaybackContext?.();restorePlaybackContext=null;
   const client=window.ytcfg?.data_?.INNERTUBE_CONTEXT?.client,original=client?.userAgent;if(!client||typeof original!=='string'||restorePlaybackContext)return;
   const changed=original.replace(/(Mozilla\/5\.0 \([^)]+)/,'$1; '+playbackMode);if(changed===original)return;
   try{client.userAgent=changed;restorePlaybackContext=()=>{if(client.userAgent===changed)client.userAgent=original;};}catch{}
  }
  // A bounded alternate WEB playback context, only after the player's explicit
  // ad-block restriction. Authentication/age/private-video failures stay intact.
  const stringify=new Proxy(originals.stringify,{apply(target,thisArg,args){
   const value=args[0];
   if(enabled&&channelPlayback&&value&&typeof value==='object'&&recoveryAttempts.has(value.videoId)&&value.attestationRequest&&value.context?.client?.clientName==='WEB'){
    const body={...value,context:{...value.context,client:{...value.context.client}},playbackContext:{...value.playbackContext,contentPlaybackContext:{...value.playbackContext?.contentPlaybackContext}}};
    const playback=body.playbackContext.contentPlaybackContext;
    if(playbackMode==='channel')body.context.client.clientScreen='CHANNEL';
    if(playbackMode==='lactmilli')body.params='8AUB';
    if(playbackMode==='yahi')body.params='YAHI';
    if(playbackMode==='inline')playback.isInlinePlaybackNoAd=true;
    if(playbackMode!=='yahi')playback.lactMilliseconds=String(Date.now());
    playback.referer=String(playback.referer||location.href).replace(/(?:#reloadxhr)?$/,'#reloadxhr');
    args=[body,...args.slice(1)];
   }else if(enabled&&channelPlayback&&value?.createCommentParams&&typeof value.context?.client?.userAgent==='string'){
    args=[{...value,context:{...value.context,client:{...value.context.client,userAgent:value.context.client.userAgent.replace(/; (?:channel|lactmilli|yahi|inline)\b/g,'')}}},...args.slice(1)];
   }
   return Reflect.apply(target,thisArg,args);
  }});
  function recoverPlayback(player,nextMode=null){
   if(!enabled||!player||typeof player.getPlayerResponse!=='function'||typeof player.loadVideoById!=='function')return;
   let response;try{response=player.getPlayerResponse();}catch{return;}
   const status=response?.playabilityStatus;if(status?.status!=='OK')restoreRecoveredOverlays();if(!['UNPLAYABLE','LOGIN_REQUIRED','ERROR'].includes(status?.status))return;
   // Some current players expose ERROR with an empty errorScreen. Read only
   // this player's visible restriction, never recommendations or page comments.
   const reason=playerMessage(status).trim()||(typeof player.innerText==='string'?player.innerText.slice(0,16000):'');
   let supportRestriction=false;try{supportRestriction=Reflect.apply(originals.stringify,JSON,[status.errorScreen||{}]).includes('https://support.google.com/youtube/answer/3037019');}catch{}
   if((!supportRestriction&&!/ad.?block|блокировщик[а-я ]*реклам/iu.test(reason))||/captcha|капч|войд|подтверд|возраст|оплат|приватн|sign.?in|confirm.*bot|age.?restrict|members.only|payment|private.video/iu.test(reason))return;
   let requested;try{const u=new URL(location.href);requested=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.startsWith('/embed/')?u.pathname.split('/')[2]:'';}catch{return;}
   let knownId=response?.videoDetails?.videoId;try{knownId=knownId||player.getVideoData?.()?.video_id;}catch{}
   const id=knownId||requested;
   if(!/^[\w-]{11}$/.test(id||'')||id!==requested||(!nextMode&&recoveryAttempts.has(id)))return;
   playbackMode=nextMode||'channel';
   if(recoveryAttempts.size>=40)recoveryAttempts.delete(recoveryAttempts.values().next().value);recoveryAttempts.add(id);channelPlayback=true;channelContext();
   let time=0;try{time=Number(player.getCurrentTime?.());}catch{}
   try{player.loadVideoById({videoId:id,startSeconds:Number.isFinite(time)?Math.max(0,time):0});}catch{}
   document.addEventListener('timeupdate',clearRecoveredGate,true);
   clearTimeout(recoveryTimer);const next=recoveryModes[recoveryModes.indexOf(playbackMode)+1],token=epoch,url=location.href;
   if(next)recoveryTimer=setTimeout(()=>{recoveryTimer=null;if(enabled&&token===epoch&&location.href===url)recoverPlayback(player,next);},2500);
  }
  // Current player fixes target placements/slots. Retain playerAds and heartbeat
  // state: deleting unrelated player state can disrupt playback/reporting.
  const adKeys=new Set(['adPlacements','adSlots']);
  const adText=/"(?:adPlacements|adSlots)"\s*:/;
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
  function playerEndpoint(value){try{const u=new URL(value,location.href);return u.origin===location.origin&&(/^\/youtubei\/v1\/(?:player|get_watch|navigation\/resolve_url)(?:\/|$)/.test(u.pathname)||['/playlist','/watch'].includes(u.pathname));}catch{return false;}}
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
   JSON.parse=parse;JSON.stringify=stringify;if(fetch)window.fetch=fetch;
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
   document.removeEventListener('timeupdate',clearRecoveredGate,true);restoreRecoveredOverlays();
   clearTimeout(recoveryTimer);recoveryTimer=null;if(JSON.parse===parse)JSON.parse=originals.parse;if(JSON.stringify===stringify)JSON.stringify=originals.stringify;restorePlaybackContext?.();restorePlaybackContext=null;channelPlayback=false;recoveryAttempts.clear();if(fetch&&window.fetch===fetch)window.fetch=originals.fetch;
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
   observer?.disconnect();observer=new MutationObserver(records=>{if(!skipTimer&&(player.classList.contains('ad-showing')||player.classList.contains('ad-interrupting')||records.some(r=>r.target===player||r.type==='childList'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('yt-playability-error-supported-renderers,#error-screen')||n.querySelector('yt-playability-error-supported-renderers,#error-screen'))))))skipTimer=setTimeout(()=>{skipTimer=null;skip();recoverPlayback(player);},150);});
   observer.observe(player,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});skip();recoverPlayback(player);
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
