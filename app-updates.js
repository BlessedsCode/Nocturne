const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const REPOSITORY='BlessedsCode/Nocturne',API='https://api.github.com/repos/'+REPOSITORY+'/releases/latest';
function versionParts(value){const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value||'');return match?match.slice(1).map(Number):null;}
function newer(next,current){const a=versionParts(next),b=versionParts(current);if(!a||!b)return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function releaseInstaller(release,current){
 if(!release||release.draft||release.prerelease||!versionParts(release.tag_name))throw new Error('Не удалось прочитать стабильный выпуск Nocturne.');
 const version=release.tag_name.replace(/^v/,''),name=`Nocturne-Setup-${version}-x64.exe`,asset=release.assets?.find(asset=>asset.name===name);
 if(!newer(version,current))return {version,available:false};
 const expected='https://github.com/'+REPOSITORY+'/releases/download/'+release.tag_name+'/'+name;
 if(!asset||asset.browser_download_url!==expected||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||'')||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>512*1024*1024)throw new Error('У выпуска нет установщика с проверяемой контрольной суммой.');
 return {version,available:true,name,url:expected,hash:asset.digest.slice(7),size:asset.size};
}
async function smallJSON(response){const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>1024*1024){await reader.cancel();throw new Error('Слишком большой ответ сервера обновлений.');}chunks.push(Buffer.from(item.value));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
class AppUpdates{
 constructor({current,directory,fetch,notify=()=>{},scanner,markDownloaded=async()=>{},launch=async()=>{}}){Object.assign(this,{current,directory,fetch,notify,scanner,markDownloaded,launch});this.info={current,stage:'idle',latest:'',available:false,received:0,total:0,error:''};this.release=null;this.ready=null;this.busy=false;}
 status(){return {...this.info};}
 emit(changes){Object.assign(this.info,changes);this.notify(this.status());return this.status();}
 async check(){if(this.busy)throw new Error('Обновление уже обрабатывается.');this.busy=true;this.emit({stage:'checking',error:''});
  try{const response=await this.fetch(API,{credentials:'omit',headers:{Accept:'application/vnd.github+json','User-Agent':'Nocturne/'+this.current},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(response.status===403||response.status===429?'GitHub временно ограничил запросы. Повтори проверку позже.':response.status===404?'Стабильный выпуск пока не опубликован.':'Не удалось проверить обновления.');
   this.release=releaseInstaller(await smallJSON(response),this.current);return this.emit({latest:this.release.version,available:this.release.available,stage:this.ready?.version===this.release.version?'ready':this.release.available?'available':'current'});
  }catch(error){this.release=null;this.emit({stage:'error',available:false,error:error.message||'Сервер обновлений недоступен.'});throw error;}finally{this.busy=false;}
 }
 async download(){if(this.busy)throw new Error('Дождись завершения текущей операции.');if(!this.release?.available)await this.check();if(!this.release?.available)return this.status();
  const release={...this.release};this.busy=true;let part,handle;
  try{this.ready=null;this.emit({stage:'downloading',received:0,total:release.size,error:''});await fs.mkdir(this.directory,{recursive:true});const folder=await fs.mkdtemp(path.join(this.directory,'release-'));const target=path.join(folder,release.name);part=target+'.part';handle=await fs.open(part,'wx',0o600);
   const response=await this.fetch(release.url,{credentials:'omit',signal:AbortSignal.timeout(10*60*1000)});if(!response.ok)throw new Error('Не удалось скачать установщик обновления.');
   const reader=response.body.getReader(),hash=createHash('sha256');let received=0,lastNotice=0;
   for(;;){const item=await reader.read();if(item.done)break;received+=item.value.byteLength;if(received>release.size){await reader.cancel();throw new Error('Размер обновления не совпадает с опубликованным.');}const bytes=Buffer.from(item.value);hash.update(bytes);await handle.writeFile(bytes);if(Date.now()-lastNotice>150){this.emit({received});lastNotice=Date.now();}}
   await handle.close();handle=null;
   if(received!==release.size||hash.digest('hex')!==release.hash)throw new Error('Контрольная сумма обновления не совпала. Установка отменена.');
   await fs.rename(part,target);part=null;await this.markDownloaded(target,release.url);this.emit({stage:'scanning',received,total:received});
   const scan=this.scanner?await this.scanner.scan(target):{state:'unavailable'};if(scan.state==='blocked')throw new Error('Microsoft Defender заблокировал установщик.');
   this.ready={version:release.version,file:target,hash:release.hash,scan};return this.emit({stage:'ready',scanState:scan.state});
  }catch(error){this.emit({stage:'error',error:error.message||'Не удалось загрузить обновление.'});throw error;}finally{if(handle)await handle.close().catch(()=>{});if(part)await fs.unlink(part).catch(()=>{});this.busy=false;}
 }
 async install(){if(this.busy||!this.ready)throw new Error('Сначала скачай обновление.');this.busy=true;try{const file=this.ready.file,stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Установщик недоступен. Скачай обновление заново.');
  const hash=createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==this.ready.hash){this.ready=null;this.emit({stage:'error',error:'Установщик изменился после скачивания. Скачай его заново.'});throw new Error(this.info.error);}
  return await this.launch(file,this.ready.scan);
  }catch(error){this.ready=null;this.emit({stage:'error',error:error.message||'Не удалось запустить установщик.'});throw error;}finally{this.busy=false;}
 }
}
module.exports={AppUpdates,newer,releaseInstaller,API};
