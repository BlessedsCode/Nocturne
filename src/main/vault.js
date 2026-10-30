const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

// RFC 4180 quotes, escaped quotes, CRLF and multiline fields. Never log CSV content.
function parsePasswords(text) {
  text = text.replace(/^\uFEFF/, '');
  // Some spreadsheet exports use semicolons or tabs; detect only outside quotes.
  const counts={',':0,';':0,'\t':0};let inQuotes=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(inQuotes&&text[i+1]==='"')i++;else inQuotes=!inQuotes;}else if(!inQuotes){if(c==='\r'||c==='\n')break;if(c in counts)counts[c]++;}}
  const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('Некорректный CSV: незакрытая кавычка.');
  row.push(field);if(row.some(Boolean))rows.push(row);
  const headers=(rows.shift()||[]).map(h=>h.trim().toLowerCase());
  const urlIndex=headers.findIndex(h=>['url','origin','website','hostname','login_uri'].includes(h));
  const userIndex=headers.findIndex(h=>['username','login','login_username'].includes(h));
  const passwordIndex=headers.findIndex(h=>['password','login_password'].includes(h));
  if([urlIndex,userIndex,passwordIndex].includes(-1))throw new Error('Нужен CSV с колонками url, username, password (экспорт Chrome, Edge, Firefox или другого браузера).');
  const entries=[];let skipped=0;
  for(const r of rows){
    try{
      const url=new URL(r[urlIndex]?.trim());
      if(!['https:','http:'].includes(url.protocol)||!r[passwordIndex]){skipped++;continue;}
      entries.push({id:randomUUID(),origin:url.origin,username:r[userIndex]||'',password:r[passwordIndex]});
    }catch{skipped++;}
  }
  return {entries,skipped};
}
function decodeCSV(bytes){
 if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
 if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Не удалось прочитать кодировку CSV. Экспортируй файл заново из браузера в UTF-8.');}
}

class Vault {
  constructor(directory,crypto){this.file=path.join(directory,'passwords.enc');this.crypto=crypto;this.queue=Promise.resolve();}
  async read(){
    if(!await this.crypto.isAsyncEncryptionAvailable())throw new Error('Защищённое хранилище Windows недоступно. Импорт не выполнен.');
    let bytes;try{bytes=await fs.readFile(this.file);}catch(e){if(e.code==='ENOENT')return [];throw e;}
    try {const decrypted=await this.crypto.decryptStringAsync(bytes);return JSON.parse(decrypted.result);}catch{throw new Error('Не удалось расшифровать хранилище. Исходный файл сохранён.');}
  }
  async write(entries){
    const bytes=await this.crypto.encryptStringAsync(JSON.stringify(entries));
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    await fs.writeFile(this.file+'.tmp',bytes,{mode:0o600});
    await fs.rename(this.file+'.tmp',this.file);
  }
  mutate(fn){const task=this.queue.then(async()=>{const entries=await this.read();const result=fn(entries);await this.write(entries);return result;});this.queue=task.catch(()=>{});return task;}
  async list(){await this.queue;return (await this.read()).map(({id,origin,username})=>({id,origin,username}));}
  async get(id){await this.queue;return (await this.read()).find(e=>e.id===id);}
  importCSV(text){const parsed=parsePasswords(text);
    if(!parsed.entries.length)throw new Error(parsed.skipped?'В файле нет подходящих записей с адресом сайта и паролем. Используй экспорт CSV из менеджера паролей.':'CSV не содержит паролей. Проверь выбранный файл и профиль исходного браузера.');
    return this.importEntries(parsed.entries,parsed.skipped);
  }
  importEntries(values,skipped=0){
   const accepted=[];
   for(const entry of values){try{const url=new URL(entry.url||entry.origin);if(!['https:','http:'].includes(url.protocol)||typeof entry.password!=='string'||!entry.password)throw new Error();accepted.push({id:randomUUID(),origin:url.origin,username:typeof entry.username==='string'?entry.username:'',password:entry.password});}catch{skipped++;}}
   return this.mutate(entries=>{
    let added=0,updated=0;
    for(const incoming of accepted){const existing=entries.find(e=>e.origin===incoming.origin&&e.username===incoming.username);if(existing){existing.password=incoming.password;updated++;}else{entries.push(incoming);added++;}}
    return {added,updated,skipped};
  });}
  remove(id){return this.mutate(entries=>{const index=entries.findIndex(e=>e.id===id);if(index>=0)entries.splice(index,1);});}
}
module.exports={Vault,parsePasswords,decodeCSV};
