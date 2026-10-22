const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createScanner,markDownloaded}=require('./defender');
const {safeFilename,dangerousName}=require('./download-names');

function setupDownloads({session,app,shell,notify,getWindow,getPreferences=()=>({askDownload:true}),security,scanner=createScanner()}){
  const historyFile=path.join(app.getPath('userData'),'downloads.json');
  let downloads=[];
  try{downloads=JSON.parse(fs.readFileSync(historyFile,'utf8')).map(d=>({...d,active:false,status:d.active||d.status==='progressing'?'interrupted':d.status,scan:['scanning','waiting'].includes(d.scan?.state)?{state:'unchecked',message:'Проверка не завершилась.'}:d.scan}));}catch{}
  const live=new Map();
  const scans=new Map();
  const snapshot=()=>downloads.map(({item,...d})=>d);
  function save(){fs.mkdirSync(path.dirname(historyFile),{recursive:true});fs.writeFileSync(historyFile,JSON.stringify(snapshot()));}
  function publish(){notify(snapshot());}
  async function scan(d){
    if(scans.has(d.id))return scans.get(d.id);
    d.scan={state:'scanning',message:'Проверка Microsoft Defender…'};publish();
    const pending=scanner.scan(d.path).then(result=>{d.scan=result;save();publish();return result;}).finally(()=>scans.delete(d.id));scans.set(d.id,pending);return pending;
  }
  session.on('will-download',(_event,item)=>{
    const id=randomUUID();
    const source=item.getURL();
    const d={id,name:item.getFilename(),received:0,total:item.getTotalBytes(),status:'progressing',active:true,paused:false,path:'',started:Date.now(),scan:{state:'waiting',message:'Ожидание загрузки'}};
    // Chromium shows the native Save As dialog; no overwrite or execution without user action.
    downloads.unshift(d);live.set(id,item);publish();
    const preferences=getPreferences();
    if(!preferences.askDownload){
      const directory=preferences.downloadDirectory||app.getPath('downloads');fs.mkdirSync(directory,{recursive:true});
      const name=safeFilename(item.getFilename());const parsed=path.parse(name);let target=path.join(directory,name),counter=1;
      const used=new Set(downloads.map(x=>x.path));while(fs.existsSync(target)||used.has(target))target=path.join(directory,parsed.name+' ('+counter+++')'+parsed.ext);
      d.path=target;item.setSavePath(target);
    }
    item.on('updated',(_event,status)=>{d.status=status;d.paused=item.isPaused();d.received=item.getReceivedBytes();d.total=item.getTotalBytes();d.path=item.getSavePath();publish();});
    item.once('done',async(_event,status)=>{
      d.status=status;d.active=false;d.path=item.getSavePath();d.received=item.getReceivedBytes();live.delete(id);
      if(status==='completed'){
        d.zoneMarked=await markDownloaded(d.path,source);
        if(getPreferences().scanDownloads){await scan(d);}else d.scan={state:'unchecked',message:'Проверка файлов выключена.'};
      }else d.scan={state:'unchecked',message:d.blockReason||'Файл не загружен.'};
      save();publish();
    });
    if(security){
      item.pause();d.checking=true;d.paused=true;
      (async()=>{let blocked=null;for(const url of item.getURLChain()){blocked=await security.check(url,{main:true,cloud:true});if(blocked)break;}if(item.isDestroyed?.())return;d.checking=false;if(blocked){d.blockReason=blocked.message;security.record(source,blocked.kind);item.cancel();}else{item.resume();d.paused=false;publish();}})().catch(()=>{d.blockReason='Не удалось проверить источник загрузки.';item.cancel();});
    }
  });
  app.on('before-quit',save);
  async function command(action,id){
    const d=downloads.find(d=>d.id===id),item=live.get(id);
    if(action==='list')return snapshot();
    if(action==='folder'){await shell.openPath(getPreferences().downloadDirectory||app.getPath('downloads'));return;}
    if(!d)throw new Error('Загрузка не найдена.');
    if(action==='pause'&&item&&!d.checking){item.isPaused()||item.getState()==='interrupted'?item.resume():item.pause();d.paused=item.isPaused();publish();}
    if(action==='cancel'&&item)item.cancel();
    if(action==='remove'&&!item){downloads=downloads.filter(x=>x.id!==id);save();publish();}
    if(action==='reveal'&&d.path&&fs.existsSync(d.path))shell.showItemInFolder(d.path);
    if(action==='scan'&&d.status==='completed')return scan(d);
    if(action==='open'){
      if(d.status!=='completed'||!d.path||!fs.existsSync(d.path))throw new Error('Файл ещё не загружен или был перемещён.');
      const {dialog}=require('electron');
      if(getPreferences().scanDownloads){
        let result=d.scan;if(scans.has(d.id))result=await scans.get(d.id);
        if(result?.state==='clean'){try{const now=await scanner.fingerprint(d.path);if(now.hash!==result.hash)result=await scan(d);}catch{throw new Error('Файл недоступен или подменён.');}}
        else if(result?.state!=='blocked')result=await scan(d);
        if(result?.state==='blocked')throw new Error(result.message+' Открытие заблокировано.');
        if(result?.state!=='clean'){const answer=await dialog.showMessageBox(getWindow(),{type:'warning',title:'Файл не проверен',message:result?.message||'Не удалось проверить файл.',detail:'Файл может быть опасен. Открывать только если доверяешь источнику.',buttons:['Отмена','Открыть без проверки'],defaultId:0,cancelId:0});if(answer.response!==1)return;}
      }
      const risky=dangerousName(d.path)||dangerousName(d.name);
      if(risky){const {dialog}=require('electron');const answer=await dialog.showMessageBox(getWindow(),{type:'warning',title:'Открыть файл?',message:'Этот файл может запускать программы на компьютере.',detail:d.name,buttons:['Отмена','Открыть'],defaultId:0,cancelId:0});if(answer.response!==1)return;}
      const error=await shell.openPath(d.path);if(error)throw new Error('Не удалось открыть файл.');
    }
  }
  return {command,snapshot,scannerStatus:scanner.status};
}
module.exports={setupDownloads};
