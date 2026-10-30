const {_electron:electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
(async()=>{
 const root=path.resolve('artifacts','http-status-'+Date.now()),profile=path.join(root,'profile');await fs.mkdir(root,{recursive:true});
 const server=http.createServer((req,res)=>{
  if(req.url==='/offline'){req.socket.destroy();return;}
  if(req.url==='/redirect'){res.writeHead(302,{location:'/status/403'});res.end();return;}
  const status=Number(req.url.match(/^\/status\/(\d+)/)?.[1])||200;
  res.writeHead(status,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Site response '+status+'</title><h1 id="server-message">Original server response '+status+'</h1><a id="recover" href="/status/200">Continue on test site</a>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(()=>closePanels(false));
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  async function load(url){await command('navigate',url);await page.waitForFunction(url=>state.tabs.some(t=>t.id===state.active&&t.url===url&&!t.loading),url);}
  const native=code=>app.evaluate(({BrowserWindow},code)=>BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.getVisible()).webContents.executeJavaScript(code),code);
  for(const status of [403,404,429,500,503]){
   await load(base+'/status/'+status);assert.equal(await page.locator('#error-page').isVisible(),false,'Do not hide a loaded HTTP '+status+' document');
   assert.equal(await native('document.querySelector("#server-message").textContent'),'Original server response '+status);
   await native('document.querySelector("#recover").click();true');await page.waitForFunction(url=>state.tabs.some(t=>t.id===state.active&&t.url===url&&!t.loading),base+'/status/200');
  }
  await command('navigate',base+'/redirect');await page.waitForFunction(url=>state.tabs.some(t=>t.id===state.active&&t.url===url&&!t.loading),base+'/status/403');assert.equal(await page.locator('#error-page').isVisible(),false);
  await command('navigate',base+'/offline');await page.waitForSelector('#error-page:not([hidden])');
  await load(base+'/status/200');assert.equal(await page.locator('#error-page').isVisible(),false);
  const result={pass:true,statuses:[403,404,429,500,503],serverDocumentVisible:true,linksWork:true,redirectTo403:true,networkFailureStillShown:true,recovery:true};
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));console.log('PASS '+JSON.stringify(result)+' '+root);
  if(process.env.CHECK_TIKTOK){
   await app.evaluate(({app})=>{global.__siteResponse=[];app.on('web-contents-created',()=>{});});
   await app.evaluate(({webContents})=>{for(const wc of webContents.getAllWebContents())wc.on('did-navigate',(_e,url,status)=>{if(url.startsWith('https://www.tiktok.com/'))global.__siteResponse.push({url,status});});});
   await command('navigate','https://www.tiktok.com/');await page.waitForFunction(()=>state.tabs.some(t=>t.id===state.active&&t.url.startsWith('https://www.tiktok.com/')&&!t.loading),null,{timeout:30000});
   const tab=await page.evaluate(()=>state.tabs.find(t=>t.id===state.active));const site=await app.evaluate(({webContents})=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://www.tiktok.com/'));return wc?.executeJavaScript('({title:document.title,text:document.body?.innerText.slice(0,500)})');});
   const live={tabError:tab.error||null,customErrorVisible:await page.locator('#error-page').isVisible(),responses:await app.evaluate(()=>global.__siteResponse),document:site};
   await fs.writeFile(path.join(root,'tiktok.json'),JSON.stringify(live,null,2));console.log('TikTok observation: '+JSON.stringify(live));
  }
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
