const {engines,searchURL}=require('./search-engines');
const {needsEnglish}=require('./english-query');
function canonical(value){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['gclid','fbclid','msclkid','yclid'].includes(key))url.searchParams.delete(key);url.searchParams.sort();return url.href.replace(/^http:/,'https:').replace(/\/\/www\./,'//');}catch{return '';}}
function queryTerms(query,limit=20){
 const stop=new Set('как что где когда почему это для при мне меня у на в и с по из во от а к о the how to a an is are on in of for do i my can get with and or install поставить установить скачать'.split(' '));
 return [...new Set((String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).map(word=>{
  if(/^(touchpad|trackpad|трекпад|тачпад)/.test(word))return 'touchpad';if(/^(driver|драйвер)/.test(word))return 'driver';
  if(/^(laptop|notebook|ноут|ноутбук)/.test(word))return 'laptop';if(word==='хуавей')return 'huawei';return word;
 }).filter(word=>word.length>2&&!stop.has(word)))].slice(0,limit);
}
function mergeResults(sources,query='',englishQuery=''){
 const rows=new Map(),terms=queryTerms(englishQuery||query);
 for(const source of sources)for(const [index,result] of (source.results||[]).entries()){
  const key=canonical(result.url);if(!key)continue;
  let row=rows.get(key);if(!row){row={url:result.url,title:result.title,snippet:result.snippet||'',sources:[],score:0};rows.set(key,row);}
  let origin=row.sources.find(item=>item.id===source.id),rank=result.rank||index+1,language=result.language||'original';
  if(!origin){origin={id:source.id,name:source.name,rank,languages:[language]};row.sources.push(origin);}
  else{origin.rank=Math.min(origin.rank,rank);if(!origin.languages.includes(language))origin.languages.push(language);}
  if(!row.snippet&&result.snippet)row.snippet=result.snippet;
 }
 const sorted=[...rows.values()];
 for(const row of sorted){const text=queryTerms(row.title+' '+row.snippet+' '+row.url,200).join(' ');const coverage=terms.length?terms.filter(term=>text.includes(term)).length/terms.length:0;
  row.score=row.sources.reduce((sum,source)=>sum+1/(40+source.rank),0)*(terms.length?.45+coverage*1.55:1);
 }
 sorted.sort((a,b)=>b.score-a.score||a.url.localeCompare(b.url));
 // Avoid filling the first screen with regional copies of a single website.
 const counts=new Map(),front=[],rest=[];
 for(const row of sorted){const host=new URL(row.url).hostname.replace(/^www\./,'');const count=counts.get(host)||0;if(front.length<10&&count<2){front.push(row);counts.set(host,count+1);}else rest.push(row);}
 return [...front,...rest];
}
// Runs in an isolated world. Only strings from ordinary web results leave the page.
function extractResults(id){
 const selectors={google:'#search a:has(h3),#rso a:has(h3)',bing:'li.b_algo h2 a',duckduckgo:'a[data-testid="result-title-a"],a.result__a',yandex:'a.OrganicTitle-Link,.serp-item a:has(h2)',brave:'.snippet a.heading-serpresult,.snippet a:has(.title)',yahoo:'.algo h3 a,#web h3 a,a[data-matarget="algo"]:has(h3),#web a:has(h3)',ecosia:'a.result-title,.result__title a,a.result__link,.mainline-result-web a:has(h2),a[data-test-id="result-link"]'};
 const found=[],seen=new Set();
 for(const link of document.querySelectorAll(selectors[id]||'a:has(h3)')){
  let href=link.href;
  try{
   let url=new URL(href,location.href);
   if(/(^|\.)google\./.test(url.hostname)&&url.pathname==='/url')href=url.searchParams.get('q')||url.searchParams.get('url')||href;
   if(url.hostname.endsWith('bing.com')&&url.pathname==='/ck/a'&&url.searchParams.has('u')){const encoded=url.searchParams.get('u');if(encoded.startsWith('a1')){const base=encoded.slice(2).replace(/-/g,'+').replace(/_/g,'/');const decoded=atob(base.padEnd(Math.ceil(base.length/4)*4,'='));href=new TextDecoder().decode(Uint8Array.from(decoded,c=>c.charCodeAt(0)));}}
   if(url.hostname.endsWith('duckduckgo.com')&&url.searchParams.has('uddg'))href=url.searchParams.get('uddg');
   if(url.hostname.endsWith('yahoo.com')){const target=url.pathname.match(/\/RU=([^/]+)\//);if(target)href=decodeURIComponent(target[1]);}
   url=new URL(href);
   if(!['https:','http:'].includes(url.protocol)||url.username||url.password)continue;
   const owned={google:/(^|\.)google\.[a-z.]+$/,bing:/(^|\.)bing\.com$/,duckduckgo:/(^|\.)duckduckgo\.com$/,yandex:/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/,brave:/(^|\.)search\.brave\.com$/,yahoo:/(^|\.)(search|r)\.yahoo\.com$/,ecosia:/(^|\.)ecosia\.org$/};
   if(owned[id]?.test(url.hostname))continue;
   const title=(link.querySelector('h2,h3,.title')?.textContent||link.textContent||'').replace(/\s+/g,' ').trim().slice(0,240);
   if(title.length<3||seen.has(url.href))continue;seen.add(url.href);
   const container=link.closest('.b_algo,.result,[data-testid="result"],.serp-item,.snippet,.algo,.MjjYud,.g,.mainline-result-web')||link.parentElement?.parentElement;
   const description=container?.querySelector('.b_caption p,.result__snippet,[data-result="snippet"],[data-testid="result-snippet"],.OrganicTextContent,.OrganicTextContentSpan,.snippet-description,.snippet-content,.content,.compText,.VwiC3b,.desc,.result-description,.result__description');
   const snippet=(description?.textContent||'').replace(/\s+/g,' ').trim().slice(0,360);
   found.push({url:url.href,title,snippet});if(found.length===12)break;
  }catch{}
 }
 const content=(document.body?.innerText||'').slice(0,12000);
 const captcha=/\/(sorry|showcaptcha|captcha)(?:[/?]|$)/i.test(location.href)||!!document.querySelector('iframe[src*=captcha],.g-recaptcha,#captcha-form')||content.length<6000&&/confirm you.re not a robot|verify you are human|unusual traffic|подтвердите.*не робот|вы не робот|подозрительный трафик/i.test(content);
 const consent=/consent\.(google|yahoo)/.test(location.hostname)||content.length<6000&&/before you continue to|прежде чем перейти/i.test(content);
 return {results:found,challenge:!found.length&&captcha,consent:!found.length&&consent};
}
class CombinedSearch{
 constructor({createView,notify,translate,timeout=12000}){this.createView=createView;this.notify=notify;this.translate=translate;this.timeout=timeout;this.sequence=0;this.run=null;this.views=new Set();this.cache=new Map();}
 cancel(){if(this.run){this.run.cancelled=true;this.run.controller.abort();}for(const view of this.views)if(!view.webContents.isDestroyed())view.webContents.close();this.views.clear();}
 start(value){
  const options=typeof value==='string'?{query:value}:value||{},queryValue=options.query;let query=queryValue;
  if(typeof query!=='string'||!query.trim()||query.trim().length>500)throw new Error('Введи запрос длиной до 500 символов.');
  this.cancel();query=query.trim();const id=++this.sequence;
  const manual=typeof options.englishQuery==='string'?options.englishQuery.trim():'';if(manual.length>500)throw new Error('Английский запрос слишком длинный.');
  const english=options.english!==false,key=JSON.stringify([query,english,manual]);
  const cached=!options.force&&this.cache.get(key),sources=engines.map(engine=>({id:engine.id,name:engine.name,url:searchURL(engine.id,query),status:'waiting',results:[],variants:[{language:needsEnglish(query)?'original':'en',query,url:searchURL(engine.id,query),status:'waiting',results:[]}]}));
  const run={id,query,key,sources,cancelled:false,controller:new AbortController(),translation:{status:english&&needsEnglish(query)?'translating':'not-needed',text:'',message:''}};this.run=run;
  if(cached&&Date.now()-cached.time<120000){run.cached=true;run.translation=cached.translation;run.sources=structuredClone(cached.sources);setImmediate(()=>this.emit(run));}
  else setImmediate(()=>this.work(run,{english,manual}));
  return this.snapshot(run);
 }
 snapshot(run){return {id:run.id,query:run.query,translation:run.translation,sources:run.sources,results:mergeResults(run.sources,run.query,run.translation.text),done:run.translation.status!=='translating'&&run.sources.every(source=>source.variants.every(variant=>!['waiting','loading'].includes(variant.status)))};}
 emit(run){if(!run.cancelled&&this.run===run){const data=this.snapshot(run);if(data.done&&!run.cached){this.cache.set(run.key,{time:Date.now(),translation:{...run.translation},sources:structuredClone(run.sources)});if(this.cache.size>10)this.cache.delete(this.cache.keys().next().value);}this.notify(data);}}
 sync(source){
  source.results=source.variants.flatMap(variant=>variant.results.map((result,index)=>({...result,rank:index+1,language:variant.language})));
  source.count=new Set(source.results.map(result=>canonical(result.url))).size;
  source.problems=source.variants.filter(variant=>['challenge','consent','unavailable'].includes(variant.status)).map(variant=>({language:variant.language,status:variant.status}));
  const pending=source.variants.some(variant=>['waiting','loading'].includes(variant.status));
  source.status=pending?'loading':source.results.length?'ready':source.variants.some(v=>v.status==='challenge')?'challenge':source.variants.some(v=>v.status==='consent')?'consent':'unavailable';
 }
 async work(run,{english,manual}){
  const tasks=run.sources.map(source=>({source,variant:source.variants[0]}));
  const translation=(async()=>{
   if(!english||!needsEnglish(run.query))return;
   try{
    const text=manual||await this.translate?.(run.query,run.controller.signal);
    if(!text)throw new Error('Автоперевод недоступен. Введи английский запрос вручную.');
    if(run.cancelled)return;run.translation={status:'ready',text,message:manual?'Английский запрос':'Перевод MyMemory'};
    for(const source of run.sources){const url=new URL(searchURL(source.id,text));if(['google','bing','brave','yahoo'].includes(source.id)){url.searchParams.set('hl','en');if(source.id==='bing')url.searchParams.set('setlang','en-US');}
     const variant={language:'en',query:text,url:url.href,status:'waiting',results:[]};source.variants.push(variant);tasks.push({source,variant});this.sync(source);
    }
   }catch(error){run.translation={status:'error',text:'',message:error.message||'Не удалось перевести запрос.'};}
   this.emit(run);
  })();
  const worker=async()=>{while(!run.cancelled){
   let task=tasks.shift();if(!task){await translation;task=tasks.shift();if(!task)break;}
   const {source,variant}=task;
   const blocked=source.variants.find(v=>v!==variant&&['challenge','consent'].includes(v.status));
   if(blocked&&variant.language==='en'){variant.status=blocked.status;this.sync(source);this.emit(run);continue;}
   variant.status='loading';this.sync(source);this.emit(run);await this.load(variant,run,source.id);this.sync(source);this.emit(run);
  }};
  await Promise.all([worker(),worker()]);
 }
 async load(source,run,engineId){
  let view,timer;
  try{
   view=this.createView();this.views.add(view);const wc=view.webContents;
   wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',(event,url)=>{if(!/^https:\/\//.test(url))event.preventDefault();});
   const loaded=new Promise((resolve,reject)=>{wc.once('dom-ready',resolve);wc.once('destroyed',()=>reject(new Error('closed')));wc.on('did-fail-load',(_event,code,_message,_url,main)=>{if(main&&code!==-3)reject(new Error('load'));});});
   wc.loadURL(source.url).catch(()=>{});
   const extract=async()=>{
    await loaded;
    for(let attempt=0;attempt<20&&!run.cancelled;attempt++){
     let data;try{data=await wc.executeJavaScriptInIsolatedWorld(998,[{code:'('+extractResults.toString()+')('+JSON.stringify(engineId)+')'}]);}catch{if(wc.isDestroyed())throw new Error('closed');await new Promise(resolve=>setTimeout(resolve,350));continue;}
     if(data.results.length||data.challenge||data.consent)return data;
     await new Promise(resolve=>setTimeout(resolve,350));
    }return {results:[],challenge:false};
   };
   const data=await Promise.race([extract(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),this.timeout);})]);
   source.results=data.results;source.status=data.results.length?'ready':data.challenge?'challenge':data.consent?'consent':'unavailable';
  }catch{source.status='unavailable';}
  finally{clearTimeout(timer);if(view){this.views.delete(view);if(!view.webContents.isDestroyed())view.webContents.close();}}
 }
}
module.exports={CombinedSearch,canonical,mergeResults,extractResults,queryTerms};
