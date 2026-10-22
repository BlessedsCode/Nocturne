import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {readFile,stat,mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const execute=promisify(execFile),pkg=JSON.parse(await readFile('package.json','utf8'));
// The verification must never replace an existing user's installation registration.
const registration='HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NocturneBrowser_is1';
let existing=false;try{await execute('reg.exe',['query',registration],{windowsHide:true});existing=true;}catch{}
if(existing)throw new Error('An existing Nocturne install is registered; automatic installer testing skipped to preserve it.');
const root=path.resolve('artifacts','installer-test-'+Date.now()),installed=path.join(root,'app'),profile=path.join(root,'profile');
const relative=path.relative(path.resolve('artifacts'),root);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
await mkdir(profile,{recursive:true});await writeFile(path.join(profile,'preserve-me.txt'),'synthetic user-data marker');
const installer=path.resolve('release',`Nocturne-Setup-${pkg.version}-x64.exe`),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const sha=file=>readFile(file).then(bytes=>createHash('sha256').update(bytes).digest('hex'));
const expected=(await readFile(installer+'.sha256','utf8')).split(' ')[0];assert.equal(await sha(installer),expected);
let child;
try{
 await execute(installer,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/GROUP=Nocturne Verification','/DIR='+installed,'/LOG='+path.join(root,'install.log')],{windowsHide:true,timeout:120000});
 const executable=path.join(installed,'Nocturne.exe');await stat(executable);
 assert.equal(await sha(path.join(installed,'resources','app.asar')),await sha(path.resolve('release',pkg.version,'Nocturne-win32-x64','resources','app.asar')));
 child=spawn(executable,['--user-data-dir='+profile,'--no-error-dialogs'],{env,windowsHide:true,stdio:'ignore'});
 await new Promise(resolve=>setTimeout(resolve,3500));assert.equal(child.exitCode,null,'Installed application exited');await stat(path.join(profile,'Local Storage','leveldb','CURRENT'));
 child.kill();await once(child,'exit');child=null;
}finally{
 if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
 const uninstaller=path.join(installed,'unins000.exe');
 try{await access(uninstaller);await execute(uninstaller,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],{windowsHide:true,timeout:60000});}catch(error){if(error.code!=='ENOENT')throw error;}
}
assert.equal(await readFile(path.join(profile,'preserve-me.txt'),'utf8'),'synthetic user-data marker');
await assert.rejects(access(path.join(installed,'Nocturne.exe')));
console.log('PASS: single-file installer hash; real per-user install; installed ASAR matches hardened build; app boots with fresh profile; uninstall removes app and preserves user data.');
