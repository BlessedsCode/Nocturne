import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{SOURCES}=require('../adblock'),{FiltersEngine}=require('@ghostery/adblocker');
// Compile reviewed snapshots; the browser's update action fetches fresh fixed-origin lists.
const lists=await Promise.all(['easylist.txt','easyprivacy.txt'].map(name=>readFile(new URL('../resources/adblock/'+name,import.meta.url),'utf8')));
for(const list of lists)if(!list.startsWith('[Adblock')||list.split('\n').length<1000)throw Error('Invalid filter snapshot');
const engine=FiltersEngine.parse(lists.join('\n'),{loadCosmeticFilters:true});
await writeFile(new URL('../resources/adblock/engine.bin',import.meta.url),engine.serialize());
await writeFile(new URL('../resources/adblock/sources.json',import.meta.url),JSON.stringify({updated:Date.now(),sources:SOURCES},null,2));
console.log('Compiled bundled EasyList/EasyPrivacy snapshots.');
