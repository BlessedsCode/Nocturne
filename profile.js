const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const defaults={searchEngine:'google',firstRunComplete:false,searchSuggestions:true,restoreSession:false,backgroundTabs:false,closeToLeft:false,zoom:100,spellcheck:true,keepHistory:true,doNotTrack:false,askDownload:true,downloadDirectory:'',media:'block',notifications:'block',geolocation:'block',threatProtection:true,trackerProtection:true,httpsOnly:true,scanDownloads:true,cloudProtection:false,cloudProvider:'safebrowsing',trackingExceptions:[]};
class Profile{
 constructor(directory){
  this.directory=directory;this.preferences={...defaults,trackingExceptions:[]};
  const saved=this.read('browser-settings.json',{});
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   for(const [key,value] of Object.entries(saved))if(Object.hasOwn(defaults,key)&&typeof defaults[key]!=='object'&&typeof value===typeof defaults[key])this.preferences[key]=value;
   if(Array.isArray(saved.trackingExceptions))this.preferences.trackingExceptions=saved.trackingExceptions.filter(value=>typeof value==='string');
  }
  if(![75,90,100,110,125,150,175,200].includes(this.preferences.zoom))this.preferences.zoom=100;
  if(!require('./search-engines').engines.some(engine=>engine.id===this.preferences.searchEngine))this.preferences.searchEngine='google';
  for(const key of ['media','notifications','geolocation'])if(!['block','ask'].includes(this.preferences[key]))this.preferences[key]='block';
  if(!['safebrowsing','webrisk'].includes(this.preferences.cloudProvider))this.preferences.cloudProvider='safebrowsing';
  const history=this.read('history.json',[]),session=this.read('tabs.json',[]);
  this.history=Array.isArray(history)?history.filter(item=>item&&typeof item.url==='string'&&/^https?:\/\//i.test(item.url)).slice(0,1000).map(item=>({...item,id:randomUUID(),title:typeof item.title==='string'?item.title:item.url})):[];
  this.lastSession=Array.isArray(session)?session.filter(url=>typeof url==='string'&&/^https?:\/\//i.test(url)).slice(0,40):[];
  const dismissed=this.read('dismissed-suggestions.json',[]);this.dismissedSuggestions=new Set(Array.isArray(dismissed)?dismissed.filter(value=>typeof value==='string').slice(-1000):[]);
 }
 read(name,fallback){try{return JSON.parse(fs.readFileSync(path.join(this.directory,name),'utf8'));}catch{return fallback;}}
 write(name,value){fs.mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
 update(changes){
  for(const [key,value] of Object.entries(changes||{})){
   if(!(key in defaults)||key==='downloadDirectory')continue;
   if(typeof defaults[key]==='boolean'&&typeof value==='boolean')this.preferences[key]=value;
   if(key==='zoom'&&[75,90,100,110,125,150,175,200].includes(value))this.preferences.zoom=value;
   if(['media','notifications','geolocation'].includes(key)&&['block','ask'].includes(value))this.preferences[key]=value;
   if(key==='searchEngine'&&require('./search-engines').engines.some(engine=>engine.id===value))this.preferences[key]=value;
   if(key==='cloudProvider'&&['safebrowsing','webrisk'].includes(value))this.preferences[key]=value;
  }
  this.write('browser-settings.json',this.preferences);return this.preferences;
 }
 deleteHistory(ids){const targets=new Set(ids);const before=this.history.length;this.history=this.history.filter(entry=>!targets.has(entry.id));this.write('history.json',this.history);return before-this.history.length;}
 dismissSuggestion(value){const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw new Error('Некорректный адрес сайта.');this.dismissedSuggestions.delete(url.origin);this.dismissedSuggestions.add(url.origin);if(this.dismissedSuggestions.size>1000)this.dismissedSuggestions.delete(this.dismissedSuggestions.values().next().value);this.write('dismissed-suggestions.json',[...this.dismissedSuggestions]);}
 recommendedHistory(){return this.history.filter(entry=>{try{return !this.dismissedSuggestions.has(new URL(entry.url).origin);}catch{return false;}});}
 visit(url,title){if(!this.preferences.keepHistory||!/^https?:\/\//i.test(url))return;const last=this.history[0];if(last?.url===url){last.title=title;last.time=Date.now();last.visits=(last.visits||1)+1;}else this.history.unshift({id:randomUUID(),url,title,time:Date.now(),visits:1});this.history=this.history.slice(0,1000);this.write('history.json',this.history);}
}
module.exports={Profile};
