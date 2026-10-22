const fs=require('node:fs');
const path=require('node:path');

const MAX_ITEMS = 300;
const MAX_BYTES = 2.5 * 1024 * 1024; // 2.5 MiB
const MAX_ICON_BYTES = 65536; // 64 KiB max per favicon

function setupFavicons({directory,fetch}){
 const file=path.join(directory,'favicons.json');
 const cache=new Map();
 let totalBytes=0;
 let saveTimer=null;

 function setEntry(origin, icon){
  if(cache.has(origin)){
   totalBytes -= (cache.get(origin).length * 2);
   cache.delete(origin);
  }
  const byteSize = icon.length * 2;
  cache.set(origin, icon);
  totalBytes += byteSize;

  while((cache.size > MAX_ITEMS || totalBytes > MAX_BYTES) && cache.size > 0){
   const oldestKey = cache.keys().next().value;
   const oldestVal = cache.get(oldestKey);
   totalBytes -= (oldestVal ? oldestVal.length * 2 : 0);
   cache.delete(oldestKey);
  }
 }

 try{
  const saved = JSON.parse(fs.readFileSync(file,'utf8'));
  if(saved && typeof saved === 'object'){
   for(const [k, v] of Object.entries(saved)){
    if(typeof v === 'string') setEntry(k, v);
   }
  }
 }catch{}

 function flush(){
  if(saveTimer){
   clearTimeout(saveTimer);
   saveTimer = null;
  }
  try{
   fs.mkdirSync(directory,{recursive:true});
   const obj = Object.fromEntries(cache);
   const tmp = file + '.tmp';
   fs.writeFileSync(tmp, JSON.stringify(obj));
   fs.renameSync(tmp, file);
  }catch{}
 }

 function scheduleSave(){
  if(!saveTimer){
   saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
   }, 2500);
   saveTimer.unref?.();
  }
 }

 const pending=new Map();
 async function read(url,limit){
  const response=await fetch(url,{signal:AbortSignal.timeout(6000),credentials:'omit',redirect:'follow'});
  const finalURL=response.url||url;
  if(!response.ok||!/^https?:\/\//i.test(finalURL))throw new Error('unavailable');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)break;chunks.push(Buffer.from(value));}}finally{try{await reader.cancel?.();}catch{}}
  return {bytes:Buffer.concat(chunks),type:response.headers.get('content-type')||'',url:finalURL};
 }
 const unescape=s=>s.replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
 async function discover(origin){
  const candidates=[];
  try{
   const page=await read(origin,131072);
   const html=page.bytes.toString('utf8');
   for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
    const attrs={};
    for(const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[match[1].toLowerCase()]=match[2]??match[3]??match[4];
    if(/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attrs.rel||'')&&attrs.href){
     const url=new URL(unescape(attrs.href),page.url);
     if(['http:','https:'].includes(url.protocol))candidates.push(url.href);
    }
   }
  }catch{}
  candidates.push(origin+'/favicon.ico');
  for(const url of [...new Set(candidates)].slice(0,4)){
   try{
    const image=await read(url, MAX_ICON_BYTES);
    if(!image.bytes.length)continue;
    const type=image.type.split(';')[0].toLowerCase();
    if(!/^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd.microsoft.icon|avif)$/.test(type))continue;
    const icon='data:'+type+';base64,'+image.bytes.toString('base64');
    setEntry(origin, icon);
    scheduleSave();
    return icon;
   }catch{}
  }
  return '';
 }
 async function get(url){
  let origin;
  try{
   const parsed=new URL(url);
   if(!['https:','http:'].includes(parsed.protocol))return '';
   origin=parsed.origin;
  }catch{return '';}
  if(cache.has(origin)){
   const icon = cache.get(origin);
   cache.delete(origin);
   cache.set(origin, icon);
   return icon;
  }
  if(pending.has(origin))return pending.get(origin);
  const promise=discover(origin);
  pending.set(origin,promise);
  try{return await promise;}finally{pending.delete(origin);}
 }
 return {get, flush};
}
module.exports={setupFavicons};
