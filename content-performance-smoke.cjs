// Regression checks for incremental cosmetic filtering in a real sandboxed renderer.
const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {FiltersEngine}=require('@ghostery/adblocker');
(async()=>{
 const root=path.resolve('artifacts','content-performance-'+Date.now()),profile=path.join(root,'profile');
 await fs.mkdir(path.join(profile,'adblock'),{recursive:true});
 await fs.writeFile(path.join(profile,'adblock','engine.bin'),FiltersEngine.parse('fixture.nocturne.test##.late-ad\nfixture.nocturne.test###late-id\nfixture.nocturne.test##.background-ad\n').serialize());
 await fs.writeFile(path.join(profile,'adblock','sources.json'),JSON.stringify({updated:Date.now()}));
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/child'?'<title>Child</title>child':'<title>Incremental filtering</title><div id="content" class="known">Content</div><iframe src="/child"></iframe>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://fixture.nocturne.test:'+server.address().port,env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile,'--host-resolver-rules=MAP fixture.nocturne.test 127.0.0.1','--no-proxy-server'],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(()=>closePanels(false));
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  await command('settings-update',{httpsOnly:false,trackerProtection:false});
  await app.evaluate((_,root)=>{const req=process.getBuiltinModule('module').createRequire(root+'/main.js'),proto=req('./adblock.js').AdBlock.prototype,original=proto.cosmetics;global.__cosmeticCalls=0;proto.cosmetics=function(...args){global.__cosmeticCalls++;return original.apply(this,args);};},process.cwd());
  await command('navigate',url+'/');await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Incremental filtering'&&!t.loading));
  const tab=await page.evaluate(()=>state.active),id=await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url+'/').id,url);
  const native=code=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code),{id,code});
  async function until(code,expected=true){for(let i=0;i<50;i++){if(await native(code)===expected)return;await page.waitForTimeout(100);}throw Error('Condition failed: '+code);}
  const resetCalls=()=>app.evaluate(()=>{global.__cosmeticCalls=0;});
  const calls=()=>app.evaluate(()=>global.__cosmeticCalls);
  await page.waitForTimeout(1200);
  await native('(()=>{const n=document.createElement("div");n.className="late-ad";n.textContent="Advertisement";document.body.append(n);return true;})()');
  await until('getComputedStyle(document.querySelector(".late-ad")).display==="none"');
  await native('document.querySelector("#content").id="late-id";true');
  await until('getComputedStyle(document.querySelector("#late-id")).display==="none"');
  await native('document.querySelector("#late-id").classList.add("playing");true');await page.waitForTimeout(1000);await resetCalls();
  await native('(()=>{let ticks=0;return new Promise(resolve=>{const timer=setInterval(()=>{document.querySelector("#late-id").classList.toggle("playing");if(++ticks===40){clearInterval(timer);resolve(true);}},25);});})()');
  await page.waitForTimeout(900);assert.equal(await calls(),0,'Known player classes should not re-run cosmetic matching');
  await command('new');await page.waitForFunction(tab=>state.active!==tab,tab);await page.waitForTimeout(800);await resetCalls();
  await native('(()=>{const n=document.createElement("div");n.id="background-content";n.className="background-ad";document.body.append(n);return true;})()');
  await page.waitForTimeout(1000);assert.equal(await calls(),0,'Hidden pages should defer cosmetic work');
  await command('switch',tab);await until('!document.hidden');await until('getComputedStyle(document.querySelector("#background-content")).display==="none"');
  await command('settings-update',{adBlock:false});await until('getComputedStyle(document.querySelector(".late-ad")).display!=="none"');await resetCalls();
  await native('document.querySelector("#late-id").classList.add("disabled-new-token");true');await page.waitForTimeout(1000);assert.equal(await calls(),0,'Disabled filtering should not scan mutations');
  await command('settings-update',{adBlock:true});await until('getComputedStyle(document.querySelector(".late-ad")).display==="none"');
  await native('document.querySelector("iframe").contentWindow.location.hash="frame-only";true');await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>state.tabs.find(t=>t.id===state.active).url),url+'/','Iframe hash must not overwrite the tab URL');
  await native('history.pushState({},"","/spa");true');await page.waitForFunction(url=>state.tabs.find(t=>t.id===state.active).url===url+'/spa',url);
  await until('getComputedStyle(document.querySelector(".late-ad")).display==="none"');
  await command('navigate',url+'/away');await page.waitForFunction(url=>state.tabs.find(t=>t.id===state.active).url===url+'/away'&&!state.tabs.find(t=>t.id===state.active).loading,url);
  await command('back');await page.waitForFunction(url=>state.tabs.find(t=>t.id===state.active).url===url+'/spa'&&!state.tabs.find(t=>t.id===state.active).loading,url);
  await native('(()=>{const n=document.createElement("div");n.className="late-ad";document.body.append(n);return true;})()');await until('[...document.querySelectorAll(".late-ad")].every(n=>getComputedStyle(n).display==="none")');
  const result={pass:true,dynamicSubtree:true,attributeTokens:true,knownClassChurnNoMatching:true,backgroundDeferred:true,disabledNoMatching:true,iframeURLProtected:true,spaNavigation:true,historyRestore:true};
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));console.log('PASS '+JSON.stringify(result)+' '+root);
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
