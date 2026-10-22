import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getCurrentFuseWire,FuseV1Options,FuseState} from '@electron/fuses';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const directory=process.argv.includes('--versioned')?path.resolve('release',version,'Nocturne-win32-x64'):path.resolve('release','Nocturne-win32-x64'),executable=path.join(directory,'Nocturne.exe');
const wire=await getCurrentFuseWire(executable);
for(const option of [FuseV1Options.RunAsNode,FuseV1Options.EnableNodeOptionsEnvironmentVariable,FuseV1Options.EnableNodeCliInspectArguments])assert.equal(wire[option],FuseState.DISABLE);
for(const option of [FuseV1Options.EnableCookieEncryption,FuseV1Options.EnableEmbeddedAsarIntegrityValidation,FuseV1Options.OnlyLoadAppFromAsar])assert.equal(wire[option],FuseState.ENABLE);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const profile=path.resolve('artifacts','packaged-profile-'+Date.now());await mkdir(profile,{recursive:true});
const child=spawn(executable,['--user-data-dir='+profile,'--no-error-dialogs'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
try{
 await new Promise(resolve=>setTimeout(resolve,3500));assert.equal(child.exitCode,null,'Packaged application exited: '+stderr);
 await stat(path.join(profile,'Local Storage','leveldb','CURRENT'));
 const personal=path.join(profile,'profiles','personal');
 const personalChild=spawn(executable,['--nocturne-profile=personal','--nocturne-root='+profile,'--user-data-dir='+personal,'--no-error-dialogs'],{env,windowsHide:true,stdio:'ignore'});
 try{
  await new Promise(resolve=>setTimeout(resolve,3500));assert.equal(personalChild.exitCode,null,'Personal packaged profile exited');assert.equal(child.exitCode,null,'Main profile must remain open');
  await stat(path.join(personal,'Local Storage','leveldb','CURRENT'));const preferences=JSON.parse(await readFile(path.join(personal,'browser-settings.json'),'utf8'));assert.equal(preferences.firstRunComplete,true);assert.equal(preferences.searchSuggestions,false);assert.equal(preferences.cloudProtection,false);
 }finally{if(personalChild.exitCode===null){personalChild.kill();await once(personalChild,'exit');}}
 child.kill();
 await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Application failed to close')),10000))]);
}finally{if(child.exitCode===null)child.kill();}
// Verify that editing packaged JavaScript fails ASAR integrity validation.
const archive=path.join(directory,'resources','app.asar'),original=await readFile(archive);
const marker=Buffer.from("const {app, BrowserWindow");const offset=original.indexOf(marker);assert(offset>=0);const modified=Buffer.from(original);modified[offset]=32;
try{
 await writeFile(archive,modified);
 const tampered=spawn(executable,['--user-data-dir='+profile+'-tampered','--no-error-dialogs'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let errorText='';tampered.stderr.on('data',chunk=>errorText+=chunk);
 try{const [code]=await Promise.race([once(tampered,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tampered archive was not rejected')),7000))]);assert.notEqual(code,0,'Tampered archive unexpectedly ran');assert.match(errorText,/integrity|hash|asar/i);}finally{if(tampered.exitCode===null)tampered.kill();}
}finally{await writeFile(archive,original);}
console.log('PASS: packaged main and personal profiles boot simultaneously with separate storage; hardened fuse values verified; modified ASAR rejected; original restored.');
