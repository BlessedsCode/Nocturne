// Opt-in local diagnostics. Never records URLs, video IDs, cookies or tokens.
const fs=require('node:fs/promises'),path=require('node:path');
function playbackSnapshot(){
 try{
  const p=document.getElementById('movie_player'),r=p?.getPlayerResponse?.(),s=r?.playabilityStatus,initial=window.ytInitialPlayerResponse?.playabilityStatus,v=document.querySelector('video');
  const requested=new URL(location.href).searchParams.get('v')||'',id=r?.videoDetails?.videoId;
  const reason=JSON.stringify(s||{}).slice(0,64000),status=value=>['OK','UNPLAYABLE','LOGIN_REQUIRED','ERROR','LIVE_STREAM_OFFLINE','CONTENT_CHECK_REQUIRED','AGE_CHECK_REQUIRED'].includes(value)?value:'OTHER';
  let playerId='';try{playerId=p?.getVideoData?.()?.video_id||'';}catch{}
  const sample={videoId:requested,attestationRequest:{},context:{client:{clientName:'WEB',clientScreen:'WATCH'}}};
  return {status:status(s?.status),initialStatus:status(initial?.status),loggedIn:window.ytcfg?.data_?.LOGGED_IN===true,hasPlayer:!!p,statusKeys:Object.keys(s||{}),errorKeys:Object.keys(s?.errorScreen||{}),playerRestriction:/ad.?block|блокировщик[а-я ]*реклам/iu.test(p?.innerText||''),contextMarker:window.ytcfg?.data_?.INNERTUBE_CONTEXT?.client?.userAgent?.includes('; channel')===true,hasPlayerResponse:!!r,responseHasVideoId:typeof id==='string'&&!!id,playerHasVideoId:typeof playerId==='string'&&!!playerId,responseMatchesPage:!!id&&id===requested,playerMatchesPage:!!playerId&&playerId===requested,canReload:typeof p?.loadVideoById==='function',adBlockReason:/ad.?block|блокировщик[а-я ]*реклам|support\.google\.com\/youtube\/answer\/3037019/iu.test(reason),loginReason:/captcha|sign.?in|confirm.*bot|войд|подтверд/iu.test(reason),interstitial:!!s?.errorScreen?.playerInterstitialRenderer,errorMessage:!!s?.errorScreen?.playerErrorMessageRenderer,warning:/Блокировщики рекламы нарушают|Ad blockers violate/i.test(document.body?.innerText||''),channelMode:JSON.parse(JSON.stringify(sample)).context.client.clientScreen==='CHANNEL',coverElements:(()=>{if(!v)return [];const b=v.getBoundingClientRect();return document.elementsFromPoint(b.x+b.width/2,b.y+b.height/2).slice(0,12).map(n=>({tag:n.tagName,id:n.id,class:n.className}));})(),playerClass:p?.className,mediaAncestors:(()=>{const list=[];let n=v;for(let i=0;n&&i<7;i++,n=n.parentElement){const s=getComputedStyle(n);list.push({tag:n.tagName,class:n.className,display:s.display,visibility:s.visibility,opacity:s.opacity,width:n.clientWidth,height:n.clientHeight});}return list;})(),videoWidth:v?.videoWidth,mediaReady:v?.readyState||0,paused:v?.paused!==false,position:Number.isFinite(v?.currentTime)?v.currentTime:0,duration:Number.isFinite(v?.duration)?v.duration:null};
 }catch{return {error:'read-failed'};}
}
function attachYouTubeDiagnostics(wc,directory,isActive){
 if(process.env.NOCTURNE_YT_DIAGNOSTICS!=='1')return;
 const timers=new Set();let serial=0;
 function schedule(){const token=++serial;for(const t of timers)clearTimeout(t);timers.clear();for(const delay of [1500,6000,12000]){const timer=setTimeout(async()=>{timers.delete(timer);if(wc.isDestroyed()||!isActive()||token!==serial)return;try{if(new URL(wc.getURL()).hostname!=='www.youtube.com')return;const data=await wc.executeJavaScript('('+playbackSnapshot.toString()+')()');if(token!==serial)return;await fs.writeFile(path.join(directory,'youtube-playback-diagnostics.json'),JSON.stringify({at:Date.now(),...data},null,2));}catch{}},delay);timer.unref?.();timers.add(timer);}}
 wc.on('did-finish-load',schedule);wc.on('did-navigate-in-page',schedule);wc.once('destroyed',()=>{serial++;for(const t of timers)clearTimeout(t);timers.clear();});
}
module.exports={playbackSnapshot,attachYouTubeDiagnostics};
