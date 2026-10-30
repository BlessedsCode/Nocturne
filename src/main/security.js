const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {domainToASCII}=require('node:url');
const {getDomain}=require('tldts');
const LISTS={threats:{url:'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/tif.mini-onlydomains.txt',name:'HaGeZi TIF Mini'},trackers:{url:'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/light-onlydomains.txt',name:'HaGeZi Multi Light'}};
function hostOf(value){try{return new URL(value).hostname.toLowerCase().replace(/\.$/,'');}catch{return '';}}
function localHost(host){return host==='localhost'||host.endsWith('.localhost')||host==='127.0.0.1'||host==='[::1]';}
function privateHost(host){return localHost(host)||/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||host==='[::]'||/^\[(fc|fd|fe80)/i.test(host)||/\.(local|internal|lan)$/.test(host)||!host.includes('.');}
function parseDomains(body){const domains=new Set();for(let line of body.split(/\r?\n/)){line=line.trim().toLowerCase();if(!line||/^[#!;]/.test(line))continue;line=line.replace(/^\*\./,'');if(line.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/.test(line))domains.add(line);}return domains;}
function matches(domains,host){let h=host;while(h){if(domains.has(h))return h;const dot=h.indexOf('.');if(dot<0)break;h=h.slice(dot+1);}return '';}
class BrowserSecurity{
 constructor({directory,bundled=path.join(__dirname,'..','..','resources','security'),getPreferences,fetch,crypto,notify=()=>{}}){
  Object.assign(this,{directory,bundled,getPreferences,fetch,crypto,notify});this.logs=[];this.blocked=0;this.httpAllowed=new Set();this.cloudCache=new Map();this.pendingCloud=new Map();this.lastCloud='not-configured';this.lastCloudCheck=0;this.lastCloudError='';this.keyFile=path.join(directory,'security-key.enc');this.key='';this.lists={};this.updateError='';
  for(const kind of Object.keys(LISTS)){let file=path.join(directory,kind+'.txt');if(!fs.existsSync(file))file=path.join(bundled,kind+'.txt');try{this.lists[kind]={domains:parseDomains(fs.readFileSync(file,'utf8')),updated:fs.statSync(file).mtimeMs};}catch{this.lists[kind]={domains:new Set(),updated:0};}}
 }
 async initialize(){try{if(fs.existsSync(this.keyFile)){const decrypted=await this.crypto.decryptStringAsync(await fsp.readFile(this.keyFile));this.key=decrypted.result;}}catch{this.lastCloud='key-unavailable';}this.key=this.key||process.env.NOCTURNE_SAFE_BROWSING_KEY||'';}
 status(){return {blocked:this.blocked,lists:Object.fromEntries(Object.entries(this.lists).map(([kind,list])=>[kind,{count:list.domains.size,updated:list.updated,name:LISTS[kind].name}])),updating:!!this.updating,updateError:this.updateError,cloud:{configured:!!this.key,enabled:this.getPreferences().cloudProtection,provider:this.getPreferences().cloudProvider,status:this.lastCloud,checkedAt:this.lastCloudCheck,error:this.lastCloudError},log:this.logs.slice(0,80),exceptions:this.getPreferences().trackingExceptions||[]};}
 record(url,kind){const host=hostOf(url);this.blocked++;this.logs.unshift({host,kind,time:Date.now()});this.logs=this.logs.slice(0,200);this.notify(this.status());}
 localVerdict(url,{main=false,topURL=''}={}){
  let parsed;try{parsed=new URL(url);}catch{return {kind:'invalid',message:'Некорректный адрес.'};}
  if(!main&&['data:','blob:','about:'].includes(parsed.protocol))return null;
  if(!['http:','https:','ws:','wss:'].includes(parsed.protocol))return {kind:'protocol',message:'Этот протокол заблокирован.'};
  const host=parsed.hostname.toLowerCase().replace(/\.$/,'');const prefs=this.getPreferences();
  if(parsed.username||parsed.password)return {kind:'credentials',message:'Адрес содержит встроенный логин или пароль. Открой сайт без них.'};
  if(prefs.threatProtection&&matches(this.lists.threats.domains,host))return {kind:'malware',message:'Домен найден в локальном списке опасных сайтов.'};
  if(main&&prefs.httpsOnly&&parsed.protocol==='http:'&&!localHost(host)&&!this.httpAllowed.has(parsed.origin))return {kind:'http',message:'HTTP не шифрует соединение. Данные могут быть перехвачены.'};
  const top=hostOf(topURL);const excepted=matches(new Set(prefs.trackingExceptions||[]),top);
  const sameSite=top&&((getDomain(host,{allowPrivateDomains:true})||host)===(getDomain(top,{allowPrivateDomains:true})||top));
  if(!main&&prefs.trackerProtection&&top&&!excepted&&!sameSite&&matches(this.lists.trackers.domains,host))return {kind:'tracker',message:'Сторонний рекламный или отслеживающий домен заблокирован.'};
  return null;
 }
 async cloudVerdict(url,{force=false,refresh=false}={}){
  const prefs=this.getPreferences();if(!prefs.cloudProtection&&!force)return null;
  if(!this.key){this.lastCloud='not-configured';return {kind:'cloud-unavailable',message:'Облачная защита включена, но ключ не настроен.'};}
  const parsed=new URL(url);if(privateHost(parsed.hostname))return null;parsed.hash='';parsed.username='';parsed.password='';const target=parsed.href;
  const provider=prefs.cloudProvider,key=this.key;
  const cacheKey=prefs.cloudProvider+'|'+target,cached=this.cloudCache.get(cacheKey);if(!refresh&&cached&&cached.expires>Date.now())return cached.verdict;
  if(this.pendingCloud.has(cacheKey))return this.pendingCloud.get(cacheKey);
  const promise=(async()=>{
   this.lastCloudError='';
   try{
    let response;if(provider==='webrisk')response=await this.fetch('https://webrisk.googleapis.com/v1/uris:search?uri='+encodeURIComponent(target)+'&threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING&threatTypes=UNWANTED_SOFTWARE',{headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(8000),credentials:'omit'});
    else response=await this.fetch('https://safebrowsing.googleapis.com/v4/threatMatches:find?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:{clientId:'nocturne-browser',clientVersion:'0.3.1'},threatInfo:{threatTypes:['MALWARE','SOCIAL_ENGINEERING','UNWANTED_SOFTWARE','POTENTIALLY_HARMFUL_APPLICATION'],platformTypes:['ANY_PLATFORM'],threatEntryTypes:['URL'],threatEntries:[{url:target}]}}),signal:AbortSignal.timeout(8000),credentials:'omit'});
    if(!response.ok){
     let reason='';try{const error=await response.json();reason=error.error?.details?.find(d=>d.reason)?.reason||'';}catch{}
     this.lastCloudError=reason==='SERVICE_DISABLED'?'Включи выбранный API в проекте Google Cloud.':reason==='API_KEY_INVALID'?'Google отклонил API-ключ. Проверь, что он скопирован полностью.':reason==='API_KEY_SERVICE_BLOCKED'?'Ограничения ключа запрещают выбранный API. Разреши его в Google Cloud.':response.status===429?'Исчерпана квота Google API. Проверь лимиты проекта.':response.status===401||response.status===403?'Google отклонил доступ. Проверь ключ, включение API и ограничения ключа.':response.status===400?'Google отклонил запрос. Проверь ключ и выбранный сервис.':'Сервис Google временно недоступен.';throw new Error();
    }
    const data=await response.json();if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();
    if(this.key!==key||this.getPreferences().cloudProvider!==provider)throw new Error();
    const danger=provider==='webrisk'?!!data.threat?.threatTypes?.length:!!data.matches?.length;
    const verdict=danger?{kind:'phishing',message:'Google сообщает, что этот адрес связан с фишингом или вредоносным содержимым.'}:null;
    this.lastCloud='available';this.lastCloudCheck=Date.now();this.cloudCache.set(cacheKey,{verdict,expires:Date.now()+(danger?300000:60000)});if(this.cloudCache.size>1000)this.cloudCache.delete(this.cloudCache.keys().next().value);return verdict;
   }catch{this.lastCloud='unavailable';this.lastCloudCheck=Date.now();if(!this.lastCloudError)this.lastCloudError='Не удалось связаться с Google. Проверь интернет или повтори позже.';return {kind:'cloud-unavailable',message:'Облачная проверка недоступна. Безопасность адреса не подтверждена.'};}
  })();this.pendingCloud.set(cacheKey,promise);try{return await promise;}finally{this.pendingCloud.delete(cacheKey);}
 }
 async testConnection(){
  if(!this.key)return {ok:false,message:'Сначала вставь свой API-ключ.',code:'missing-key'};
  const verdict=await this.cloudVerdict('https://example.com/',{force:true,refresh:true});
  if(verdict)return {ok:false,message:verdict.kind==='cloud-unavailable'?this.lastCloudError:'Тестовый адрес получил предупреждение. Защита не включена автоматически.',checkedAt:this.lastCloudCheck};
  return {ok:true,message:'Google ответил успешно. Подключение работает.',checkedAt:this.lastCloudCheck};
 }
 async check(url,context={}){const local=this.localVerdict(url,context);if(local)return local;return context.cloud?this.cloudVerdict(url):null;}
 allowHTTP(url){const parsed=new URL(url);if(parsed.protocol!=='http:')throw new Error('Неверный протокол.');this.httpAllowed.add(parsed.origin);}
 async setKey(key){if(typeof key!=='string'||key.length>512)throw new Error('Некорректный ключ.');if(!await this.crypto.isAsyncEncryptionAvailable())throw new Error('Хранилище Windows недоступно.');await fsp.mkdir(this.directory,{recursive:true});if(key.trim())await fsp.writeFile(this.keyFile,await this.crypto.encryptStringAsync(key.trim()));else await fsp.rm(this.keyFile,{force:true});this.key=key.trim();this.cloudCache.clear();this.lastCloud=this.key?'ready':'not-configured';}
 exception(host,remove=false){host=domainToASCII(String(host).trim().toLowerCase().replace(/\.$/,''));if(!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(host))throw new Error('Укажи домен без протокола и пути.');const values=new Set(this.getPreferences().trackingExceptions||[]);remove?values.delete(host):values.add(host);return [...values].slice(0,100);}
 async secureFetch(url,options={}){
  for(let i=0;i<6;i++){const verdict=this.localVerdict(url,{main:false});if(verdict)throw new Error('Запрос заблокирован защитой.');const response=await this.fetch(url,{...options,redirect:'manual',credentials:'omit'});if(response.status>=300&&response.status<400&&response.headers.get('location')){url=new URL(response.headers.get('location'),url).href;await response.body?.cancel().catch(()=>{});continue;}return response;}throw new Error('Слишком много перенаправлений.');
 }
 async update(){
  if(this.updating)return this.updating;this.updateError='';this.updating=(async()=>{
   const failures=[];for(const [kind,source] of Object.entries(LISTS))try{
    const response=await this.fetch(source.url,{signal:AbortSignal.timeout(25000),credentials:'omit'});if(!response.ok)throw new Error();
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>20000000)throw new Error();chunks.push(Buffer.from(chunk));}
    const text=Buffer.concat(chunks).toString('utf8'),domains=parseDomains(text);if(domains.size<1000)throw new Error();
    await fsp.mkdir(this.directory,{recursive:true});const file=path.join(this.directory,kind+'.txt');await fsp.writeFile(file+'.tmp',text);await fsp.rename(file+'.tmp',file);this.lists[kind]={domains,updated:Date.now()};
   }catch{failures.push(source.name);}
   if(failures.length)this.updateError='Не удалось обновить: '+failures.join(', ')+'. Сохранены предыдущие списки.';
  })();this.notify(this.status());try{await this.updating;}finally{this.updating=null;this.notify(this.status());}return this.status();
 }
}
module.exports={BrowserSecurity,parseDomains,matches,hostOf,localHost,privateHost,LISTS};
