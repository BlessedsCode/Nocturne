// Sandboxed, isolated preload: no API is exposed to websites.
const {ipcRenderer,webFrame}=require('electron');
let cssKey=null,lastCSS='',cosmeticTimer=null,cosmeticBusy=false,stopped=false,cosmeticEpoch=0;
let adsEnabled=false,configuredURL='',configSerial=0,scanTimer=null,scanJob=null,overflowTimer=null,hiddenDirty=false,contentVisible=true,visibilitySerial=0;
const classes=new Set(),ids=new Set(),roots=[],queuedRoots=new Set();
function visible(){return contentVisible&&!document.hidden;}
function resumeCosmetics(){if(!visible())return;if(hiddenDirty){hiddenDirty=false;queueRoot(document.documentElement);}scheduleScan();queueCosmetics();}
let sponsorEnabled=false,segments=[],videoURL='',generation=0,skipped=new Set(),notice=null,lastCheck=0;
// Remember bounded tokens and inspect only added subtrees/changed elements.
// Repeated player/progress class toggles must not rescan the entire document.
function collect(el){
 if(!el||el.nodeType!==1)return;let changed=false;
 for(const token of el.classList)if(token.length<=128&&classes.size<2000&&!classes.has(token)){classes.add(token);changed=true;}
 if(el.id&&el.id.length<=128&&ids.size<2000&&!ids.has(el.id)){ids.add(el.id);changed=true;}
 if(changed)queueCosmetics();
}
function queueRoot(root){
 if(!adsEnabled||stopped||!root?.isConnected||root.nodeType!==1)return;
 if(!visible()){hiddenDirty=true;return;}
 if(queuedRoots.has(root))return;
 if(roots.length>=64){if(!overflowTimer)overflowTimer=setTimeout(()=>{overflowTimer=null;queueRoot(document.documentElement);},5000);return;}
 queuedRoots.add(root);roots.push(root);scheduleScan();
}
function scheduleScan(){if(!scanTimer&&!stopped&&adsEnabled&&visible())scanTimer=setTimeout(scan,16);}
function scan(){
 scanTimer=null;if(stopped||!adsEnabled||!visible())return;let budget=500;
 while(budget>0){
  if(!scanJob){const root=roots.shift();if(!root)break;queuedRoots.delete(root);if(!root.isConnected)continue;collect(root);scanJob={walker:document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT),visited:1};budget--;}
  const node=scanJob.walker.nextNode();if(!node||scanJob.visited++>=10000){scanJob=null;continue;}collect(node);budget--;
 }
 if(scanJob||roots.length)scheduleScan();
}
const observer=new MutationObserver(records=>{
 if(!adsEnabled||stopped)return;if(!visible()){hiddenDirty=true;return;}
 for(const record of records){if(record.type==='attributes')collect(record.target);else for(const node of record.addedNodes)queueRoot(node);}
});
function clearCosmeticWork(){clearTimeout(scanTimer);scanTimer=null;clearTimeout(cosmeticTimer);cosmeticTimer=null;clearTimeout(overflowTimer);overflowTimer=null;roots.length=0;queuedRoots.clear();scanJob=null;observer.disconnect();}
async function configure(force=false){
 const url=location.href.split('#')[0];if(!force&&configuredURL===url)return;configuredURL=url;
 const serial=++configSerial,visibilityAtRequest=visibilitySerial;cosmeticEpoch++;adsEnabled=false;clearCosmeticWork();classes.clear();ids.clear();
 try{const config=await ipcRenderer.invoke('content-filter-config');if(serial!==configSerial||stopped)return;adsEnabled=!!config.ads;if(visibilitySerial===visibilityAtRequest)contentVisible=!!config.visible;
  if(!adsEnabled){if(cssKey)webFrame.removeInsertedCSS(cssKey);cssKey=null;lastCSS='';return;}
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','id']});cosmetics();queueRoot(document.documentElement);
 }catch(error){console.warn('Nocturne filters:',error.message);}
}
async function cosmetics(){if(cosmeticBusy||stopped||!adsEnabled||!visible()||!/^https?:$/.test(location.protocol))return;cosmeticBusy=true;const epoch=cosmeticEpoch;try{
 const css=await ipcRenderer.invoke('content-cosmetics',{classes:[...classes],ids:[...ids]});
 if(stopped)return;if(epoch!==cosmeticEpoch){queueCosmetics();return;}if(css===lastCSS)return;lastCSS=css;if(cssKey){webFrame.removeInsertedCSS(cssKey);cssKey=null;}if(css)cssKey=webFrame.insertCSS(css,{cssOrigin:'author'});
 }catch(error){console.warn("Nocturne filters:",error.message);}finally{cosmeticBusy=false;}}
function queueCosmetics(){if(cosmeticTimer||stopped||!adsEnabled||!visible())return;cosmeticTimer=setTimeout(()=>{cosmeticTimer=null;cosmetics();},700);}
function isYouTube(){return location.protocol==='https:'&&['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname);}
async function refreshSponsor(force=false){if(!isYouTube()||stopped)return;const url=location.href;if(url===videoURL&&!force)return;if(url!==videoURL){segments=[];skipped.clear();notice?.remove();notice=null;}videoURL=url;lastCheck=Date.now();const token=++generation;try{const result=await ipcRenderer.invoke('content-sponsor');if(stopped||token!==generation||location.href!==url)return;sponsorEnabled=result.enabled;segments=result.segments||[];}catch(e){console.warn('Nocturne filters: sponsor '+e.message);segments=[];}}
function showSkip(video,segment){notice?.remove();const box=document.createElement('div');box.style.cssText='position:fixed;right:24px;bottom:90px;z-index:2147483647;background:#172019;color:#e4e6d8;border:1px solid #738068;border-radius:5px;padding:12px 16px;font:13px Segoe UI,sans-serif;box-shadow:0 8px 30px #0008';const label=document.createElement('span');label.textContent='SponsorBlock · интеграция пропущена  ';const undo=document.createElement('button');undo.textContent='Вернуть';undo.style.cssText='margin-left:10px;padding:6px 10px;color:#172019;background:#c3ccb5;border:0;border-radius:3px;cursor:pointer';undo.onclick=()=>{if(video.isConnected)video.currentTime=segment.start;box.remove();};box.append(label,undo);(document.body||document.documentElement).append(box);notice=box;setTimeout(()=>box.remove(),8000);}
function onTime(event){if(!sponsorEnabled||!segments.length||!isYouTube()||location.href!==videoURL)return;const v=event.target,player=document.getElementById('movie_player');if(!(v instanceof HTMLVideoElement)||v.paused||!Number.isFinite(v.duration)||player&&(player.classList.contains('ad-showing')||player.classList.contains('ad-interrupting')))return;for(const s of segments){if(skipped.has(s.id)||s.end>v.duration||s.duration&&Math.abs(s.duration-v.duration)>2)continue;if(v.currentTime>=s.start&&v.currentTime<s.end-.05){skipped.add(s.id);v.currentTime=s.end;showSkip(v,s);ipcRenderer.send('content-sponsor-skipped');break;}}}
ipcRenderer.on('content-filter-settings',()=>{generation++;segments=[];sponsorEnabled=false;configure(true);refreshSponsor(true);});
ipcRenderer.on('content-page-url',()=>{configure();refreshSponsor();});
ipcRenderer.on('content-visibility',(_event,value)=>{visibilitySerial++;contentVisible=value===true;resumeCosmetics();});
window.addEventListener('DOMContentLoaded',()=>{configure();document.addEventListener('timeupdate',onTime,true);document.addEventListener('play',()=>{if(!segments.length&&Date.now()-lastCheck>60000)refreshSponsor(true);},true);document.addEventListener('yt-navigate-finish',()=>{configure();refreshSponsor();});refreshSponsor();},{once:true});
document.addEventListener('visibilitychange',resumeCosmetics);
window.addEventListener('pagehide',()=>{stopped=true;configSerial++;clearCosmeticWork();});
window.addEventListener('pageshow',event=>{stopped=false;if(event.persisted)configure(true);else configure();refreshSponsor(true);});
