// Synthetic OAuth flow only. No real account or credentials are used.
const {_electron:electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
(async()=>{
 const root=path.resolve('artifacts','auth-popup-'+Date.now()),profile=path.join(root,'profile');await fs.mkdir(root,{recursive:true});
 let base,provider,callbackCookie='',postBody='';
 const server=http.createServer((req,res)=>{
  res.setHeader('content-type','text/html');
  if(req.url==='/provider'){res.end('<title>Test provider</title><button id="complete" onclick="location.href=\''+base+'/callback\'">Complete test sign-in</button>');return;}
  if(req.url==='/callback'){callbackCookie=req.headers.cookie||'';res.setHeader('set-cookie','test_signed_in=1; SameSite=Lax; Path=/');res.end('<title>Callback</title><script>if(window.opener)window.opener.postMessage("auth-complete",'+JSON.stringify(base)+');setTimeout(()=>window.close(),100);</script>');return;}
  if(req.url==='/post'){req.on('data',part=>postBody+=part);req.on('end',()=>res.end('<title>POST target</title><p>Posted</p>'));return;}
  if(req.url==='/plain'){res.end('<title>Plain tab</title>Content');return;}
  res.setHeader('set-cookie','test_site_session=preserved; SameSite=Lax; HttpOnly; Path=/');
  res.end('<!doctype html><title>Test sign-in site</title><button id="login" onclick="window.auth=window.open('+JSON.stringify(provider+'/provider').replace(/"/g,'&quot;')+',\'auth\',\'width=600,height=700\');window.popupReturned=!!window.auth;">Test sign-in</button><a id="plain" target="_blank" rel="noopener" href="/plain">Plain link</a><form id="post" method="post" target="_blank" action="/post"><input type="hidden" name="state" value="fixture-csrf"><input type="hidden" name="value" value="a+b &amp; test"></form><script>window.authComplete=false;addEventListener("message",e=>{if(e.origin==='+JSON.stringify(base)+'&&e.data==="auth-complete")window.authComplete=true;});</script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;provider='http://localhost:'+server.address().port;
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(()=>closePanels(false));
  await app.evaluate(()=>{global.__authErrors=[];process.on('uncaughtException',error=>global.__authErrors.push(error.message));process.on('unhandledRejection',error=>global.__authErrors.push(String(error)));});
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  await command('navigate',base+'/site');await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Test sign-in site'&&!t.loading));
  const parent=await page.evaluate(()=>state.active),parentContents=await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url).id,base+'/site');
  const native=(id,code)=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code,true),{id,code});
  const contentID=url=>app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url)?.id,url);
  await native(parentContents,'document.querySelector("#login").click();true');
  assert.equal(await native(parentContents,'window.popupReturned'),true,'window.open must return a real child Window, not null');
  await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Test provider'&&!t.loading));
  const popup=await contentID(provider+'/provider');assert(popup);assert.equal(await native(popup,'window.opener!==null'),true);
  assert.equal(await command('tab-discard',parent),false,'Keep the opener alive while authentication is pending');
  await native(popup,'document.querySelector("#complete").click();true');
  await page.waitForFunction(parent=>state.tabs.length===1&&state.active===parent,parent);
  assert.equal(await native(parentContents,'window.authComplete'),true);assert.equal(await native(parentContents,'location.href'),base+'/site');
  assert(callbackCookie.includes('test_site_session=preserved'));assert(await native(parentContents,'document.cookie.includes("test_signed_in=1")'));
  // Some providers open a blank child first and assign its location afterwards.
  await native(parentContents,'window.blank=window.open("about:blank","blank-auth","width=600,height=700");window.blankReturned=!!window.blank;setTimeout(()=>window.blank.location='+JSON.stringify(provider+'/provider')+',100);true');
  assert.equal(await native(parentContents,'window.blankReturned'),true);await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Test provider'&&!t.loading));
  const blank=await contentID(provider+'/provider');assert.equal(await native(blank,'window.opener!==null'),true);await native(blank,'window.close();true');await page.waitForFunction(()=>state.tabs.length===1);
  await native(parentContents,'document.querySelector("#post").submit();true');await page.waitForFunction(()=>state.tabs.some(t=>t.title==='POST target'&&!t.loading));
  assert.equal(new URLSearchParams(postBody).get('state'),'fixture-csrf');assert.equal(new URLSearchParams(postBody).get('value'),'a+b & test');
  await command('close-tab',await page.evaluate(()=>state.active));
  await native(parentContents,'document.querySelector("#plain").click();true');await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Plain tab'&&!t.loading));
  const plain=await contentID(base+'/plain');assert.equal(await native(plain,'window.opener===null'),true,'Preserve explicit noopener');
  assert.equal(await native(plain,'typeof require+":"+typeof window.browser'),'undefined:undefined');
  const prefs=await app.evaluate(({webContents},id)=>{const p=webContents.fromId(id).getLastWebPreferences();return {node:p.nodeIntegration,sandbox:p.sandbox,isolation:p.contextIsolation,webSecurity:p.webSecurity};},plain);
  assert.deepEqual(prefs,{node:false,sandbox:true,isolation:true,webSecurity:true});
  await command('close-tab',parent);await page.waitForFunction(()=>state.tabs.length===1);
  assert.equal(await native(plain,'location.href'),base+'/plain','Ordinary new tabs must survive closure of their opener');
  assert.deepEqual(await app.evaluate(()=>global.__authErrors),[]);
  const result={pass:true,realWindowProxy:true,crossOriginRedirect:true,postMessage:true,popupCloseReturnsToSite:true,sharedCookies:true,blankThenNavigate:true,postFormPreserved:true,noopenerPreserved:true,sandboxPreserved:true,ordinaryTabOutlivesOpener:true};
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));console.log('PASS '+JSON.stringify(result)+' '+root);
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
