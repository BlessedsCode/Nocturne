const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{createDecipheriv}=require('node:crypto');
const {discoverBrowsers}=require('./browser-import');
const roots={chrome:[['LOCALAPPDATA','Google/Chrome/User Data']],edge:[['LOCALAPPDATA','Microsoft/Edge/User Data']],brave:[['LOCALAPPDATA','BraveSoftware/Brave-Browser/User Data']],vivaldi:[['LOCALAPPDATA','Vivaldi/User Data']],opera:[['APPDATA','Opera Software/Opera Stable'],['APPDATA','Opera Software/Opera GX Stable']],yandex:[['LOCALAPPDATA','Yandex/YandexBrowser/User Data']]};
const exists=async file=>{try{return (await fs.stat(file)).isFile();}catch{return false;}};
async function discoverSources({env=process.env,browsers}={}){
 browsers=browsers||await discoverBrowsers({env});const sources=[];
 for(const browser of browsers){const profiles=[],seen=new Set();
  const add=async(directory,kind,root)=>{directory=path.resolve(directory);if(seen.has(directory))return;const file=kind==='nss'?'logins.json':'Login Data';if(await exists(path.join(directory,file))){seen.add(directory);profiles.push({directory,kind,root:root||directory});}};
  if(['zen','firefox'].includes(browser.id)){
   const base=browser.id==='zen'?'zen':'Mozilla/Firefox';
   for(const key of ['APPDATA','LOCALAPPDATA'])if(env[key]){
    const directory=path.join(env[key],base);
    let ini='';try{ini=await fs.readFile(path.join(directory,'profiles.ini'),'utf8');}catch{}
    for(const block of ini.split(/\r?\n\[/)){const match=block.match(/(?:^|\r?\n)Path=(.+)/);if(match){const target=match[1].trim();await add(path.isAbsolute(target)?target:path.join(directory,target),'nss');}}
    try{for(const item of await fs.readdir(path.join(directory,'Profiles'),{withFileTypes:true}))if(item.isDirectory())await add(path.join(directory,'Profiles',item.name),'nss');}catch{}
   }
   for(const relative of ['profile','Data/profile'])await add(path.join(path.dirname(browser.executable),relative),'nss');
  }else for(const [key,relative] of roots[browser.id]||[])if(env[key]){
   const root=path.join(env[key],relative);await add(root,'chromium',root);
   try{for(const item of await fs.readdir(root,{withFileTypes:true}))if(item.isDirectory()&&/^(Default|Profile \d+)$/.test(item.name))await add(path.join(root,item.name),'chromium',root);}catch{}
  }
  sources.push({...browser,profiles});
 }return sources;
}
async function runNative(request,{timeout=45000}={}){
 const source=await fs.readFile(path.join(__dirname,'native','password-import.ps1'),'utf8');
 const encoded=Buffer.from(source,'utf16le').toString('base64');
 return new Promise((resolve,reject)=>{
  const executable=path.join(process.env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const child=spawn(executable,['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',size=0,finished=false;const decoder=new (require('node:string_decoder').StringDecoder)('utf8');
  const timer=setTimeout(()=>{child.kill();finish(new Error('Превышено время переноса. Закрой исходный браузер и повтори.'));},timeout);
  function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);output='';error?reject(error):resolve(result);}
  child.on('error',()=>finish(new Error('Не удалось запустить локальный модуль переноса Windows.')));
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024){child.kill();finish(new Error('Слишком большой объём данных для переноса.'));}else output+=decoder.write(chunk);});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.on('close',()=>{if(finished)return;try{output+=decoder.end();finish(null,JSON.parse(output));}catch{finish(new Error('Локальный модуль переноса недоступен. Исходные данные не изменены.'));}});child.stdin.end(JSON.stringify(request));
 });
}
async function readChromium(profile,native=runNative){
 const {DatabaseSync}=require('node:sqlite');const database=new DatabaseSync(path.join(profile.directory,'Login Data'),{readOnly:true});let rows;
 try{rows=database.prepare('SELECT origin_url,username_value,password_value FROM logins WHERE blacklisted_by_user = 0 LIMIT 20000').all();}finally{database.close();}
 const entries=[];let blocked=0,failed=0,key;
 const aes=rows.some(row=>/^v1[01]$/.test(Buffer.from(row.password_value).subarray(0,3).toString()));
 if(aes){try{const state=JSON.parse(await fs.readFile(path.join(profile.root,'Local State'),'utf8'));const encoded=Buffer.from(state.os_crypt.encrypted_key,'base64');if(encoded.subarray(0,5).toString()!=='DPAPI')throw new Error();const result=await native({mode:'dpapi',values:[encoded.subarray(5).toString('base64')]});if(result.values?.[0])key=Buffer.from(result.values[0],'base64');}catch{}}
 const legacy=rows.filter(row=>{const value=Buffer.from(row.password_value);return value.length&&!/^v\d\d$/.test(value.subarray(0,3).toString());});
 let plain=[];if(legacy.length){const result=await native({mode:'dpapi',values:legacy.map(row=>Buffer.from(row.password_value).toString('base64'))});plain=result.values||[];}
 let legacyIndex=0;
 try{for(const row of rows){const value=Buffer.from(row.password_value);if(!value.length)continue;const version=value.subarray(0,3).toString();let password;
   if(version==='v20'){blocked++;continue;}
   try{if(version==='v10'||version==='v11'){if(!key){blocked++;continue;}const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(3,15));decipher.setAuthTag(value.subarray(-16));password=Buffer.concat([decipher.update(value.subarray(15,-16)),decipher.final()]).toString('utf8');}
    else if(/^v\d\d$/.test(version)){blocked++;continue;}else{const decrypted=plain[legacyIndex++];if(!decrypted)throw new Error();password=Buffer.from(decrypted,'base64').toString('utf8');}
    entries.push({url:row.origin_url,username:row.username_value,password});
   }catch{failed++;}
  }}finally{key?.fill(0);plain.fill(null);}
 return {ok:true,entries,blocked,failed};
}
class AutomaticImport{
 constructor({vault,discover=discoverSources,native=runNative,read=readChromium,notify=()=>{}}){this.vault=vault;this.discover=discover;this.native=native;this.read=read;this.notify=notify;this.sources=[];this.busy=false;}
 async scan(){if(this.busy)throw new Error('Сначала дождись завершения переноса.');this.sources=await this.discover();return this.sources.map(({id,name,steps,profiles})=>({id,name,steps,profiles:profiles.length,kind:['zen','firefox'].includes(id)?'nss':'chromium'}));}
 async start(value){
  if(this.busy)throw new Error('Перенос уже выполняется.');
  if(!Array.isArray(value?.ids)||!value.ids.length||value.ids.length>8||value.ids.some(id=>typeof id!=='string'||!this.sources.some(source=>source.id===id)))throw new Error('Выбери найденные браузеры.');
  this.busy=true;const results=[];
  try{for(const id of [...new Set(value.ids)]){const source=this.sources.find(source=>source.id===id);const summary={id,name:source.name,added:0,updated:0,skipped:0,blocked:0,failed:0,locked:false,status:'working'};this.notify({...summary});
    if(!source.profiles.length){summary.status='empty';summary.message='В этом браузере не найдены сохранённые пароли.';}
    for(const profile of source.profiles){try{
     const result=profile.kind==='nss'?await this.native({mode:'nss',directory:path.dirname(source.executable),profile:profile.directory,password:typeof value.passwords?.[id]==='string'?value.passwords[id]:''}):await this.read(profile,this.native);
     if(!result.ok){if(result.code==='primary-password')summary.locked=true;else summary.failed++;continue;}
     summary.blocked+=result.blocked||0;summary.failed+=result.failed||0;
     if(result.entries?.length){const imported=await this.vault.importEntries(result.entries);summary.added+=imported.added;summary.updated+=imported.updated;summary.skipped+=imported.skipped;result.entries.length=0;}
    }catch{summary.failed++;}}
    if(source.profiles.length){summary.status=summary.locked?'locked':summary.blocked?'protected':summary.failed?'partial':summary.added+summary.updated?'done':'empty';summary.message=summary.locked?'Нужен основной пароль исходного браузера.':summary.blocked?'Часть паролей защищена самим браузером (App-Bound / Windows). Автоматический доступ к ним недоступен.':summary.failed?'Часть данных недоступна. Закрой исходный браузер и повтори перенос.':summary.status==='empty'?'Сохранённых паролей нет.':'Перенос завершён.';}
    results.push(summary);this.notify({...summary});
   }return results;
  }finally{this.busy=false;}
 }
}
module.exports={AutomaticImport,discoverSources,runNative,readChromium};
