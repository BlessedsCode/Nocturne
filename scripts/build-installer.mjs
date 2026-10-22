import {readFile,stat,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
const execute=promisify(execFile),pkg=JSON.parse(await readFile('package.json','utf8'));
const directory=path.resolve('release',pkg.version,'Nocturne-win32-x64');
await stat(path.join(directory,'Nocturne.exe'));
const compiler=process.env.INNO_COMPILER||path.resolve('.tools','inno-portable','tools','ISCC.exe');
await stat(compiler);
// Only the pre-existing, hardened app is packaged. No profile/export data is included.
const output=path.resolve('release');
const {stdout}=await execute(compiler,['/Qp',path.resolve('scripts','installer.iss')],{windowsHide:true,maxBuffer:2*1024*1024,env:{...process.env,NOCTURNE_APP_VERSION:pkg.version,NOCTURNE_BUILD_DIRECTORY:directory,NOCTURNE_INSTALLER_OUTPUT:output}});
process.stdout.write(stdout);
const installer=path.join(output,`Nocturne-Setup-${pkg.version}-x64.exe`),bytes=await readFile(installer),hash=createHash('sha256').update(bytes).digest('hex');
await writeFile(installer+'.sha256',hash+'  '+path.basename(installer)+'\n');
console.log(JSON.stringify({installer,bytes:bytes.length,sha256:hash}));
