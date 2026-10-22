const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {createHash}=require('node:crypto');
function findDefender(){
 if(process.platform!=='win32')return '';
 const root=path.join(process.env.ProgramData||'C:\\ProgramData','Microsoft','Windows Defender','Platform');
 let folders=[];try{folders=fs.readdirSync(root).filter(n=>/^\d+\.\d+\./.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch{}
 for(const dir of folders){const file=path.join(root,dir,'MpCmdRun.exe');if(fs.existsSync(file))return file;}
 const fallback=path.join(process.env.ProgramFiles||'C:\\Program Files','Windows Defender','MpCmdRun.exe');return fs.existsSync(fallback)?fallback:'';
}
async function fingerprint(file){const stat=await fsp.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Файл недоступен.');const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return {hash:hash.digest('hex'),size:stat.size,mtime:stat.mtimeMs};}
function run(file,args){return new Promise(resolve=>execFile(file,args,{windowsHide:true,timeout:120000,maxBuffer:1024*1024},error=>resolve({code:error?error.code:0,timeout:!!error?.killed})));}
function createScanner({executable=findDefender(),execute=run}={}){
 let queue=Promise.resolve();
 const status=()=>({available:!!executable,engine:'Microsoft Defender',platform:process.platform});
 async function scan(file){
  if(!executable)return {state:'unavailable',message:'Microsoft Defender недоступен. Файл не проверен.'};
  const task=queue.then(async()=>{
   try{const before=await fingerprint(file);const result=await execute(executable,['-Scan','-ScanType','3','-File',file,'-DisableRemediation']);
    if(result.timeout)return {state:'error',message:'Истекло время проверки Defender.'};
    if(result.code!==0)return {state:'blocked',message:'Defender не подтвердил безопасность: обнаружена угроза или произошла ошибка сканирования.'};
    const after=await fingerprint(file);if(before.hash!==after.hash||before.mtime!==after.mtime)return {state:'blocked',message:'Файл изменился во время проверки.'};
    return {state:'clean',message:'Defender не обнаружил угроз.',...after,scannedAt:Date.now()};
   }catch{return {state:'error',message:'Не удалось проверить файл через Defender.'};}
  });queue=task.catch(()=>{});return task;
 }
 return {status,scan,fingerprint};
}
async function markDownloaded(file,source){
 if(process.platform!=='win32')return false;
 try{const url=new URL(source);url.username='';url.password='';url.search='';url.hash='';await fsp.writeFile(file+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\nHostUrl='+url.href.replace(/[\r\n]/g,'')+'\r\n');return true;}catch{return false;}
}
module.exports={createScanner,findDefender,fingerprint,markDownloaded};
