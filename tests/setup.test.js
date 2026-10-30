const {test}=require('node:test'),assert=require('node:assert/strict');
const {engines,searchURL}=require('../src/shared/search-engines');
const {discoverBrowsers}=require('../src/main/browser-import');
const {CombinedSearch,canonical,mergeResults}=require('../src/main/combined-search');

test('Zen portable executable is discovered and its password manager uses a fixed about:logins URL',async()=>{
 const path=require('node:path'),{EventEmitter}=require('node:events');
 const executable=path.join('C:/fixture/user','zen.exe');
 const found=await discoverBrowsers({env:{USERPROFILE:'C:/fixture/user'},registry:async()=>[],stat:async file=>{if(file!==executable)throw new Error();return {isFile:()=>true};}});assert.deepEqual(found.map(browser=>browser.id),['zen']);
 let launched;await require('../src/main/browser-import').openBrowserExport('zen',{executable,launch:(exe,args)=>{launched={exe,args};const child=new EventEmitter();child.unref=()=>{};setImmediate(()=>child.emit('spawn'));return child;}});
 assert.deepEqual(launched,{exe:executable,args:['about:logins']});
});
test('combined workers are bounded to two, close after extraction, and reuse a completed search',async()=>{
 const {EventEmitter}=require('node:events');let active=0,maxActive=0,created=0;
 let finish;const done=new Promise(resolve=>finish=resolve);
 const search=new CombinedSearch({createView:()=>{
  active++;created++;maxActive=Math.max(maxActive,active);const wc=new EventEmitter();let destroyed=false;
  wc.setWindowOpenHandler=()=>{};wc.isDestroyed=()=>destroyed;wc.close=()=>{if(destroyed)return;destroyed=true;active--;wc.emit('destroyed');};
  wc.loadURL=async()=>{setTimeout(()=>{if(!destroyed)wc.emit('dom-ready');},5);};
  wc.executeJavaScriptInIsolatedWorld=async()=>({results:[{url:'https://example.com/abbey',title:'Abbey'}],challenge:false});
  return {webContents:wc};
 },notify:data=>{if(data.done)finish(data);}});
 search.start('abbey');const result=await done;assert.equal(maxActive,2);assert.equal(active,0);assert.equal(created,7);assert.equal(result.results.length,1);assert.equal(result.results[0].sources.length,7);
 const cached=search.start('abbey');assert.equal(cached.done,true);assert.equal(created,7);search.cancel();
});
test('combined results deduplicate tracking URLs, preserve meaningful parameters, and rank agreements',()=>{
 assert.equal(canonical('http://www.example.com/a?utm_source=x&q=one#top'),'https://example.com/a?q=one');
 assert.notEqual(canonical('https://example.com/?q=one'),canonical('https://example.com/?q=two'));
 const result=mergeResults([{id:'google',name:'Google',results:[{url:'https://solo.example',title:'Solo'},{url:'https://example.com/a?utm_source=x',title:'Abbey'}]},{id:'bing',name:'Bing',results:[{url:'https://example.com/a',title:'Abbey'}]}]);
 assert.equal(result.length,2);assert.equal(result[0].title,'Abbey');assert.equal(result[0].sources.length,2);
});
test('seven distinct search engines encode a literal query into a fixed HTTPS origin',()=>{
 assert.equal(engines.length,7);assert.equal(new Set(engines.map(e=>e.id)).size,7);
 const query='замок & test? # + / %';
 for(const engine of engines){const url=new URL(searchURL(engine.id,query));assert.equal(url.protocol,'https:');assert.equal(url.origin,new URL(engine.url).origin);assert.equal(url.searchParams.get(engine.param),query);assert.equal(url.hash,'');}
});
test('browser discovery only reads installation metadata; known paths, custom registry path, deduplication and absent installs',async()=>{
 const checked=[];const path=require('node:path');
 const files=new Set([path.join('C:/fixture/local','Google/Chrome/Application/chrome.exe'),path.join('C:/custom','firefox.exe')]);
 const found=await discoverBrowsers({env:{LOCALAPPDATA:'C:/fixture/local'},registry:async exe=>exe==='firefox.exe'?[path.join('C:/custom','firefox.exe')]:[],stat:async file=>{checked.push(file);if(!files.has(file))throw new Error('absent');return {isFile:()=>true};}});
 assert.deepEqual(found.map(browser=>browser.id),['chrome','firefox']);assert(checked.every(file=>file.toLowerCase().endsWith('.exe')));assert(!checked.some(file=>/login data|logins.json|key4.db/i.test(file)));
 const absent=await discoverBrowsers({env:{},registry:async()=>[],stat:async()=>{throw new Error();}});assert.deepEqual(absent,[]);
});
