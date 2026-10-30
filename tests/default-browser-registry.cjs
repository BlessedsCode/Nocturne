const {registerWindows}=require('../src/main/default-browser'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),assert=require('node:assert/strict');
const run=promisify(execFile);
(async()=>{
 if(process.platform!=='win32')return console.log('SKIP Windows registry verification');
 const name='NocturneVerification-'+Date.now(),progID=name+'URL',exe='C:\\Nocturne Verification\\Nocturne.exe';
 const query=async key=>{try{return (await run('reg.exe',['query',key,'/reg:64'],{windowsHide:true})).stdout;}catch{return null;}};
 const choices=['HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice','HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice'];
 const before=await Promise.all(choices.map(query));
 try{await registerWindows(exe,{name,progID});const root='HKCU\\Software\\Clients\\StartMenuInternet\\'+name;assert((await query(root+'\\Capabilities\\URLAssociations')).includes(progID));assert((await query('HKCU\\Software\\Classes\\'+progID+'\\shell\\open\\command')).includes('"'+exe+'" -- "%1"'));assert((await query('HKCU\\Software\\RegisteredApplications')).includes(name));assert.deepEqual(await Promise.all(choices.map(query)),before);console.log('PASS real HKCU registration, HTTP/HTTPS capabilities, quoted command, protected default choices unchanged');}
 finally{for(const key of ['HKCU\\Software\\Classes\\'+progID,'HKCU\\Software\\Clients\\StartMenuInternet\\'+name])await run('reg.exe',['delete',key,'/f','/reg:64'],{windowsHide:true}).catch(()=>{});await run('reg.exe',['delete','HKCU\\Software\\RegisteredApplications','/v',name,'/f','/reg:64'],{windowsHide:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
