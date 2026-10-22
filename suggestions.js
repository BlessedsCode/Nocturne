// Provider URLs follow the OpenSearch suggestion format (also used by Firefox):
// https://github.com/mozilla-firefox/firefox/blob/main/services/settings/dumps/main/search-config-v2.json
const providers={bing:['https://www.bing.com/osjson.aspx','query',{}],google:['https://www.google.com/complete/search','q',{client:'firefox'}],duckduckgo:['https://ac.duckduckgo.com/ac/','q',{type:'list'}],yandex:['https://suggest.yandex.ru/suggest-ff.cgi','part',{}]};
function searchText(value){
 if(typeof value!=='string')return '';
 const q=value.trim();
 // Never send addresses, credentials, local hostnames or URL parameters as suggestions.
 if(q.length<2||q.length>160||/[\x00-\x1f/:@?=\\]/.test(q)||/(?:^|\s)(?:localhost|[\w-]+\.[\w.-]+)(?:\s|$)/i.test(q))return '';
 return q;
}
function historySuggestions(history,query=''){
 const byURL=new Map();
 for(const item of Array.isArray(history)?history:[]){
  try{const url=new URL(item.url);if(!['https:','http:'].includes(url.protocol))continue;
   const old=byURL.get(url.href),time=Number(item.time)||0,visits=Math.max(1,Number(item.visits)||1);
   if(old){old.visits+=visits;if(time>old.time){old.title=String(item.title||url.hostname).slice(0,240);old.time=time;}}
   else byURL.set(url.href,{url:url.href,title:String(item.title||url.hostname).slice(0,240),time,visits,origin:url.origin});
  }catch{}
 }
 const all=[...byURL.values()].sort((a,b)=>b.time-a.time),q=String(query).trim().toLocaleLowerCase();
 if(q)return all.filter(item=>(item.title+' '+item.url).toLocaleLowerCase().includes(q)).slice(0,4).map(item=>({...item,group:'История'}));
 const origins=new Map();
 for(const item of all){const old=origins.get(item.origin);if(old)old.visits+=item.visits;else origins.set(item.origin,{...item});}
 const frequent=[...origins.values()].filter(item=>item.visits>1).sort((a,b)=>b.visits-a.visits||b.time-a.time).slice(0,2);
 const excluded=new Set(frequent.map(item=>item.origin)),seen=new Set();
 const recent=all.filter(item=>{if(excluded.has(item.origin)||seen.has(item.origin))return false;seen.add(item.origin);return true;}).slice(0,4);
 return [...recent.map(item=>({...item,group:'Недавно'})),...frequent.map(item=>({...item,group:'Часто'}))];
}
class SearchSuggestions{
 constructor(fetcher){this.fetch=fetcher;this.cache=new Map();this.pending=null;}
 async get(value,enabled){
  this.pending?.abort();this.pending=null;
  const query=searchText(value?.query),engine=value?.engine;
  if(!enabled||!query||!Object.hasOwn(providers,engine))return [];
  const key=engine+'\n'+query,cached=this.cache.get(key);
  if(cached&&Date.now()-cached.time<60000)return cached.items;
  const [base,param,params]=providers[engine],url=new URL(base);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  url.searchParams.set(param,query);
  const controller=new AbortController();this.pending=controller;
  const timer=setTimeout(()=>controller.abort(),3000);
  try{
   const response=await this.fetch(url.href,{signal:controller.signal,credentials:'omit',redirect:'error',headers:{Accept:'application/json'}});
   if(!response.ok)return [];
   // Bound untrusted provider responses before parsing; never evaluate JSONP or HTML.
   const reader=response.body.getReader();let size=0,chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return [];}chunks.push(Buffer.from(value));}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const items=[...new Set((Array.isArray(result?.[1])?result[1]:[]).filter(item=>typeof item==='string'&&item.length>0&&item.length<=200&&!/[\x00-\x1f]/.test(item)))].slice(0,6);
   this.cache.set(key,{time:Date.now(),items});if(this.cache.size>40)this.cache.delete(this.cache.keys().next().value);
   return items;
  }catch{return [];}finally{clearTimeout(timer);if(this.pending===controller)this.pending=null;}
 }
}
module.exports={SearchSuggestions,historySuggestions,searchText};
