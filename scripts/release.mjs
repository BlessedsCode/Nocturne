import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import process from 'node:process';
const execute=promisify(execFile);
const args=process.argv.slice(2);
const bump=['patch','minor','major'].find(value=>args.includes(value))||'patch';
const skipTests=args.includes('--skip-tests');
const dryRun=args.includes('--dry-run');
if(args.includes('--help')){
 console.log('Использование: npm run release -- [patch|minor|major] [--skip-tests] [--dry-run]');
 process.exit(0);
}
async function git(...values){const {stdout}=await execute('git',values,{windowsHide:true,maxBuffer:8*1024*1024});return stdout.trim();}
function nextVersion(version,kind){
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);
 if(!match)throw new Error('Некорректная версия в package.json: '+version);
 let [major,minor,patch]=match.slice(1).map(Number);
 if(kind==='major'){major+=1;minor=0;patch=0;}
 if(kind==='minor'){minor+=1;patch=0;}
 if(kind==='patch')patch+=1;
 return major+'.'+minor+'.'+patch;
}
async function updateJson(file,version){
 const data=JSON.parse(await readFile(file,'utf8'));
 data.version=version;
 if(data.packages?.[''])data.packages[''].version=version;
 await writeFile(file,JSON.stringify(data,null,2)+'\n');
}
const pkg=JSON.parse(await readFile('package.json','utf8'));
const version=nextVersion(pkg.version,bump);
const tag='v'+version;
const branch=(await git('rev-parse','--abbrev-ref','HEAD'))||'master';
if(branch==='HEAD')throw new Error('Сейчас detached HEAD. Переключись на ветку перед выпуском.');
const remote=(await git('remote','get-url','origin')).replace(/\.git$/,'');
const actionsURL=remote.replace(/^git@github\.com:/,'https://github.com/').replace(/^https:\/\/[^@]+@/,'https://')+'/actions/workflows/release.yml';
const tagExists=await execute('git',['rev-parse','--verify','refs/tags/'+tag],{windowsHide:true}).then(()=>true,()=>false);
if(tagExists)throw new Error('Тег '+tag+' уже существует. Увеличь версию вручную или удали старый тег.');
console.log('Выпуск '+pkg.version+' → '+version+' ('+bump+'), ветка '+branch);
if(!skipTests){
 console.log('Проверки: node --test …');
 try{await execute(process.execPath,['--test'],{windowsHide:true,maxBuffer:16*1024*1024,env:process.env});}
 catch(error){process.stderr.write(String(error.stdout||''));process.stderr.write(String(error.stderr||''));throw new Error('Проверки не прошли. Выпуск отменён.');}
 console.log('Проверки прошли.');
}
const changed=(await git('status','--porcelain')).split('\n').filter(Boolean);
if(changed.length)console.log('Будут закоммичены изменения:\n'+changed.map(line=>'  '+line).join('\n'));
if(dryRun){console.log('--dry-run: изменения не внесены. Был бы тег '+tag+'.');process.exit(0);}
await updateJson('package.json',version);
await updateJson('package-lock.json',version);
await git('add','-A');
await git('commit','-m','Release '+tag);
await git('tag','-a',tag,'-m','Nocturne '+version);
await git('push','origin','HEAD:refs/heads/'+branch);
await git('push','origin',tag);
console.log('Готово: тег '+tag+' отправлен. GitHub Actions запустит сборку и публикацию:');
console.log(actionsURL);
