const {_electron:electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
(async()=>{
 const root=path.resolve('artifacts','request-lifecycle-'+Date.now()),profile=path.join(root,'profile');await fs.mkdir(root,{recursive:true});
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':req.url.startsWith('/ping')?'text/plain':'text/html'});res.end(req.url.startsWith('/ping')?'ok':'<title>Lifecycle '+req.url+'</title>Content');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(()=>closePanels(false));
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  await app.evaluate(()=>{global.__lifecycleErrors=[];process.on('uncaughtException',error=>global.__lifecycleErrors.push(error.message));process.on('unhandledRejection',error=>global.__lifecycleErrors.push(String(error)));});
  await command('navigate',base+'/detached');await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Lifecycle /detached'&&!t.loading));
  await command('open-tab',base+'/active');await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Lifecycle /active'&&!t.loading));
  const id=await app.evaluate(({webContents},base)=>webContents.getAllWebContents().find(w=>w.getURL()===base+'/active').id,base);
  await app.evaluate(({BrowserWindow},base)=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL()===base+'/detached');if(!view)throw Error('Missing fixture view');global.__detachedView=view;global.__detachedReads=0;Object.defineProperty(view,'webContents',{configurable:true,get(){global.__detachedReads++;return undefined;}});},base);
  for(let i=0;i<10;i++)assert.equal(await app.evaluate(({webContents},{id,url})=>webContents.fromId(id).executeJavaScript('fetch('+JSON.stringify(url)+').then(r=>r.text())'),{id,url:base+'/ping?'+i}),'ok');
  assert((await app.evaluate(()=>global.__detachedReads))>0,'The handler must encounter the detached view');
  assert.equal(await app.evaluate(async({session},url)=>(await session.fromPartition('persist:nocturne').fetch(url)).text(),base+'/ping?ownerless'),'ok');
  const update=await command('settings-update',{zoom:110,adBlock:false});assert(!update.error,update.error);
  assert.deepEqual(await app.evaluate(()=>global.__lifecycleErrors),[]);
  await app.evaluate(()=>{delete global.__detachedView.webContents;global.__detachedView=null;});
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify({pass:true,detachedViewRequests:10,ownerlessRequest:true,settingsWhileDetached:true,uncaughtErrors:[]},null,2));
  console.log('PASS real network callbacks and settings tolerate a native view with missing WebContents; ownerless requests complete; no uncaught exceptions. '+root);
 }finally{await app.evaluate(()=>{if(global.__detachedView)delete global.__detachedView.webContents;}).catch(()=>{});await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
