import {packager} from '@electron/packager';
import {flipFuses,FuseVersion,FuseV1Options,getCurrentFuseWire} from '@electron/fuses';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const output=process.argv.includes('--versioned')?path.join('release',pkg.version):'release';
const results=await packager({dir:process.cwd(),name:'Nocturne',executableName:'Nocturne',platform:'win32',arch:'x64',out:output,overwrite:true,asar:true,prune:true,electronVersion:pkg.devDependencies.electron.replace(/^[^\d]+/,''),appVersion:pkg.version,appBundleId:'dev.nocturne.browser',win32metadata:{CompanyName:'Nocturne',FileDescription:'Nocturne Browser',ProductName:'Nocturne'},ignore:[/^\/(?:\.git|\.tools|artifacts|release|scripts)(?:\/|$)/,/^\/\.env(?:\.|$)/,/\.enc$/,/\.(?:test\.js|cjs)$/,/(?:^|\/)SECURITY\.md$/,/(?:^|\/)assets\/reference\.jpg$/]});
for(const directory of results){
 const executable=path.join(directory,'Nocturne.exe');
 await flipFuses(executable,{version:FuseVersion.V1,[FuseV1Options.RunAsNode]:false,[FuseV1Options.EnableCookieEncryption]:true,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,[FuseV1Options.EnableNodeCliInspectArguments]:false,[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,[FuseV1Options.OnlyLoadAppFromAsar]:true});
 const wire=await getCurrentFuseWire(executable);await writeFile(path.join(directory,'security-build.json'),JSON.stringify({version:pkg.version,fuses:wire,signed:false,autoUpdates:false,manualUpdates:'github-releases-sha256'},null,2));
 await copyFile('docs/FOR-FRIEND.txt',path.join(directory,'START-HERE.txt'));
 console.log('Built '+executable+' (unsigned; hardened fuses and ASAR validation enabled).');
}
