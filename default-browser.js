const {execFile}=require('node:child_process'),{promisify}=require('node:util'),os=require('node:os');
const execute=promisify(execFile);
const path=require('node:path');
const APP_NAME='Nocturne',PROG_ID='NocturneURL';
function externalURLs(argv){
 const args=Array.isArray(argv)?argv:[],delimiter=args.indexOf('--'),values=delimiter>=0?args.slice(delimiter+1):args.slice(1),urls=[];
 for(const value of values){if(typeof value!=='string'||value.length>16384||/[\u0000-\u001f\u007f]/.test(value)||!/^https?:\/\//i.test(value))continue;try{const u=new URL(value);if(!u.hostname||u.username||u.password)continue;const url=u.href;if(!urls.includes(url))urls.push(url);if(urls.length===16)break;}catch{}}
 return urls;
}
function registrationEntries(executable,name=APP_NAME,progID=PROG_ID){
 if(!executable||/["\r\n]/.test(executable)||!/^[-\w]+$/.test(name)||!/^[-\w]+$/.test(progID))throw Error('Некорректная регистрация браузера');
 const root='Software\\Clients\\StartMenuInternet\\'+name,capabilities=root+'\\Capabilities',command='"'+executable+'" -- "%1"',icon='"'+executable+'",0';
 return [
  ['Software\\RegisteredApplications',name,capabilities],
  [root,'',name],[root+'\\DefaultIcon','',icon],[root+'\\shell\\open\\command','','"'+executable+'"'],
  [capabilities,'ApplicationName',name],[capabilities,'ApplicationDescription','Nocturne — веб-браузер с защитой и отдельными профилями'],[capabilities,'ApplicationIcon',icon],
  [capabilities+'\\URLAssociations','http',progID],[capabilities+'\\URLAssociations','https',progID],
  ['Software\\Classes\\'+progID,'','Nocturne URL'],['Software\\Classes\\'+progID,'URL Protocol',''],['Software\\Classes\\'+progID+'\\DefaultIcon','',icon],['Software\\Classes\\'+progID+'\\shell\\open\\command','',command],
 ];
}
async function registerWindows(executable,{name=APP_NAME,progID=PROG_ID,run=execute}={}){
 for(const [key,value,data] of registrationEntries(executable,name,progID))await run('reg.exe',['add','HKCU\\'+key,...(value?['/v',value]:['/ve']),'/t','REG_SZ','/d',data,'/f','/reg:64'],{windowsHide:true,timeout:10000});
}
function settingsURL(release=os.release()){return Number(release.split('.')[2])>=22000?'ms-settings:defaultapps?registeredAppUser='+encodeURIComponent(APP_NAME):'ms-settings:defaultapps';}
class DefaultBrowser{
 constructor({app,shell,platform=process.platform,executable=process.execPath,run=execute}){Object.assign(this,{app,shell,platform,executable,run});}
 async status(){const supported=this.platform==='win32'&&this.app.isPackaged;let registered=false;try{if(supported){const {stdout}=await this.run('reg.exe',['query','HKCU\\Software\\Clients\\StartMenuInternet\\Nocturne\\shell\\open\\command','/ve','/reg:64'],{windowsHide:true,timeout:5000});registered=stdout.toLowerCase().includes(('"'+this.executable+'"').toLowerCase());}}catch{}const owns=async protocol=>{try{const info=await this.app.getApplicationInfoForProtocol(protocol+'://');return !!info.path&&path.win32.resolve(info.path).toLowerCase()===path.win32.resolve(this.executable).toLowerCase();}catch{return false;}};const [http,https]=supported?await Promise.all([owns('http'),owns('https')]):[false,false];return {supported,registered,http,https,isDefault:http&&https};}
 async open(){if(this.platform!=='win32'||!this.app.isPackaged)throw Error('Установи собранный Nocturne, чтобы выбрать его браузером по умолчанию.');await registerWindows(this.executable,{run:this.run});await this.shell.openExternal(settingsURL());return {opened:true};}
}
module.exports={DefaultBrowser,externalURLs,registrationEntries,registerWindows,settingsURL};
