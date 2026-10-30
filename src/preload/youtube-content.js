// Local, explainable rules. No remote analysis and no claim of fact checking.
(function(){
 const modes=new Set(['off','mark','skip']);
 function config(p={}){const result={enabled:p.ytContentEnabled===true};for(const key of ['AI','Clickbait','Voice','Quality'])result[key]=modes.has(p['ytContent'+key])?p['ytContent'+key]:'off';for(const key of ['Words','Channels'])result[key]=typeof p['ytContent'+key]==='string'?p['ytContent'+key].slice(0,4000).split('\n').map(s=>s.trim().toLowerCase()).filter(Boolean).slice(0,100):[];return result;}
 function classify(title,channel,c){
  if(!c.enabled)return [];title=String(title||'').slice(0,2000);channel=String(channel||'').trim().toLowerCase();const hits=[];
  // Topic discussions, tutorials and explicit denials are not disclosures.
  // Prefer missing a match over hiding a normal educational video.
  const discussion=/(?:\b(?:how to|tutorial|guide|explained|detect|spot|debunk|review)\b|(?:^|[\s:—–-])(?:как|урок|обзор|разбор|обучение|распознать|отличить|проверить)(?:[\s:?!,.]|$))/iu.test(title);
  const denial=/(?:\b(?:not|never|no)\s+(?:ai[- ]generated|ai[- ]voice)|не\s+(?:сгенерирован[аоы]?|создан[оы]?|озвучен[аоы]?)\s+(?:ии|нейросетью)|без\s+(?:ии|нейросетей|нейросети))/iu.test(title);
  const add=(key,label,reason)=>{if(c[key]!=='off'&&(!['AI','Voice'].includes(key)||!discussion&&!denial))hits.push({key,label,reason,mode:c[key]});};
  if(/(?:ai[- ]generated|generated (?:with|by) (?:ai|sora|veo)|создан[оы]? (?:с помощью (?:ии|нейросети)|нейросетью|ии)|сгенерирован[аоы]? (?:ии|нейросетью)|#aigenerated)/iu.test(title))add('AI','Указание на AI','В названии автор указал генерацию с помощью AI. Это текстовый сигнал, а не анализ кадров.');
  if(/(?:ai[- ](?:voice|narration)|text[- ]to[- ]speech|озвуч(?:ено|ка) (?:ии|нейросетью)|синтезированн[а-я]* голос)/iu.test(title))add('Voice','Синтез речи','В названии явно указан синтез речи. Звук не анализировался.');
  if(/(?:вы не поверите|от вас скрывают|шок!|срочно!|you won.t believe|they don.t want you to know)/iu.test(title))add('Clickbait','Возможный кликбейт','В названии есть эмоциональная формулировка. Соответствие содержанию не проверялось.');
  if(/(?:!!!|\?\?\?)/u.test(title))add('Quality','Навязчивое оформление','В названии повторяются знаки !!! или ???. Это личное правило оформления, а не оценка качества ролика.');
  const word=c.Words.find(w=>title.toLowerCase().includes(w));if(word)hits.push({key:'Words',label:'Личное правило',reason:'Стоп-слово в названии: '+word,mode:'skip'});
  if(channel&&c.Channels.includes(channel))hits.push({key:'Channels',label:'Скрытый канал',reason:'Канал совпал с твоим списком: '+channel,mode:'skip'});
  return hits;
 }
 if(typeof module!=='undefined')module.exports={config,classify};
 if(typeof window==='undefined'||typeof process==='undefined'||!process.versions?.electron)return;
 if(window.top!==window||location.protocol!=='https:'||!['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname))return;
 const {ipcRenderer}=require('electron');
 const cards='ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytd-reel-item-renderer,ytm-shorts-lockup-view-model';
 let prefs=config(),timer=null,stopped=false,serial=0,bypass=false,notice=null,watchPanel=null,shortKey='',skipTimes=[];
 const entries=new Map();
 function panel(){const host=document.createElement('div');host.setAttribute('data-nocturne-content','');const root=host.attachShadow({mode:'closed'});const style=document.createElement('style');style.textContent=':host{color-scheme:dark}section{box-sizing:border-box;background:#192019f2;color:#e0e3d5;border:1px solid #67715b;border-radius:7px;padding:10px 13px;font:13px/1.5 "Segoe UI",sans-serif;box-shadow:0 8px 24px #0004}summary,button{cursor:pointer}button{font:inherit;color:#e0e3d5;background:#30392c;border:1px solid #748063;border-radius:4px;padding:4px 9px;margin:7px 7px 0 0}p{margin:7px 0;max-width:420px}';const box=document.createElement('section');root.append(style,box);return {host,box};}
 function button(box,label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;box.append(b);}
 function restore(card,e){if(e.hidden){if(e.display)card.style.setProperty('display',e.display,e.priority);else card.style.removeProperty('display');}e.host?.remove();entries.delete(card);}
 function reset(){for(const [card,e]of entries)restore(card,e);notice?.remove();notice=null;watchPanel?.remove();watchPanel=null;}
 function explain(box,hits){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Почему?';details.append(summary);for(const hit of hits){const p=document.createElement('p');p.textContent=hit.reason;details.append(p);}box.append(details);}
 function hiddenNotice(){const count=[...entries.values()].filter(e=>e.hidden).length;if(!count){notice?.remove();notice=null;return;}if(!notice){const p=panel();notice=p.host;notice.style.cssText='position:fixed;bottom:24px;left:24px;z-index:2147483646;max-width:340px';const text=document.createElement('span');text.dataset.count='';p.box.append(text);button(p.box,'Показать на этой странице',()=>{bypass=true;reset();});notice._count=text;document.documentElement.append(notice);}notice._count.textContent='Nocturne · скрыто роликов: '+count;}
 function cardInfo(card){const link=card.querySelector('a#video-title,a#video-title-link,a[href*="/watch?"],a[href*="/shorts/"]');const title=link?.getAttribute('title')||card.querySelector('#video-title,h3')?.textContent||link?.getAttribute('aria-label')||link?.textContent||'';const channel=card.querySelector('ytd-channel-name a,a[href^="/@"]')?.textContent||'';return {title:title.trim(),channel:channel.trim(),url:link?.getAttribute('href')||''};}
 function scan(){timer=null;if(stopped||document.hidden)return;for(const [card,e]of entries)if(!card.isConnected)restore(card,e);if(!prefs.enabled||bypass)return;
  for(const card of [...document.querySelectorAll(cards)].slice(0,250)){
   if(card.parentElement?.closest(cards))continue;const info=cardInfo(card),signature=JSON.stringify([info,prefs]),previous=entries.get(card);if(previous?.signature===signature)continue;if(previous)restore(card,previous);if(!info.title||entries.size>=500)continue;const hits=classify(info.title,info.channel,prefs);if(!hits.length)continue;
   const e={signature,display:card.style.getPropertyValue('display'),priority:card.style.getPropertyPriority('display'),hidden:hits.some(h=>h.mode==='skip')};entries.set(card,e);
   if(e.hidden)card.style.setProperty('display','none','important');else{const p=panel();e.host=p.host;const label=document.createElement('strong');label.textContent=hits.map(h=>h.label).join(' · ');p.box.append(label);explain(p.box,hits);button(p.box,'Оставить без пометки',()=>{p.host.remove();});card.append(p.host);}
  }
  hiddenNotice();watch();
 }
 function watch(){
  const short=location.pathname.startsWith('/shorts/'),active=short?document.querySelector('ytd-reel-video-renderer[is-active],ytd-reel-video-renderer[active]'):null;
  const title=short?active?.querySelector('h2,#video-title')?.textContent:document.querySelector('ytd-watch-metadata h1')?.textContent;
  const channel=(short?active:document.querySelector('ytd-watch-metadata'))?.querySelector('ytd-channel-name a,a[href^="/@"]')?.textContent||'';
  const key=location.href+'|'+title,hits=classify(title||'',channel,prefs);if(watchPanel?._key===key)return;watchPanel?.remove();watchPanel=null;if(!title||!hits.length)return;
  const p=panel();watchPanel=p.host;watchPanel._key=key;p.host.style.cssText='position:fixed;top:80px;right:24px;z-index:2147483646;max-width:360px';const label=document.createElement('strong');label.textContent='Nocturne · '+hits.map(h=>h.label).join(' · ');p.box.append(label);explain(p.box,hits);button(p.box,'Закрыть',()=>p.host.remove());document.documentElement.append(p.host);
  // Only a positively identified active Short can advance, with a circuit breaker.
  if(short&&active&&hits.some(h=>h.mode==='skip')&&shortKey!==location.pathname){shortKey=location.pathname;skipTimes=skipTimes.filter(t=>Date.now()-t<15000);const next=document.querySelector('#navigation-button-down button,button[aria-label="Next video"],button[aria-label="Следующее видео"]');if(next&&!next.disabled&&skipTimes.length<5){skipTimes.push(Date.now());next.click();}else{const text=document.createElement('p');text.textContent='Автопропуск приостановлен. Можно перейти вручную.';p.box.append(text);}}
 }
 function schedule(){if(!timer&&!stopped&&!document.hidden)timer=setTimeout(scan,450);}
 const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('[data-nocturne-content]')))schedule();});
 async function refresh(){const token=++serial;try{const next=await ipcRenderer.invoke('youtube-content-config');if(token!==serial||stopped)return;prefs=config(next);bypass=false;reset();shortKey='';if(prefs.enabled){observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});schedule();}else observer.disconnect();}catch{}}
 function start(){stopped=false;refresh();}
 ipcRenderer.on('content-filter-settings',refresh);ipcRenderer.on('content-page-url',()=>{bypass=false;schedule();});document.addEventListener('yt-navigate-finish',()=>{bypass=false;schedule();});document.addEventListener('visibilitychange',schedule);
 window.addEventListener('pagehide',()=>{stopped=true;serial++;clearTimeout(timer);timer=null;observer.disconnect();reset();});window.addEventListener('pageshow',start);
 if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
