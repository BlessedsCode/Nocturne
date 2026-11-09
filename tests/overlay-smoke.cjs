const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
(async()=>{
 const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<title>Preserved website</title><body style="background:#2c4260;color:white;height:2400px;margin:30px;font:24px sans-serif"><h1>Original website</h1><input id="draft" value="original"><p style="margin-top:800px">Scroll position</p></body>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/page';
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+path.resolve('artifacts','overlay-profile-'+Date.now())],env});
 try{
 const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(url=>window.browser.command('navigate',url),url);await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('Preserved website'));
 const id=await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url).id,url);
 await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('document.getElementById("draft").value="unsaved text";scrollTo(0,420)'),id);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await app.evaluate(({webContents},id)=>{
  global.__captureCalls=0;
  webContents.fromId(id).capturePage=()=>{global.__captureCalls++;return new Promise(()=>{});};
 },id);
 const nativeVisible=()=>app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows()[0].contentView.children.some(view=>view.webContents?.id===id&&view.getVisible()),id);
 const covered=async selector=>{
  await page.locator(selector).waitFor();
  await page.locator('body.site-overlay-open').waitFor();
  assert.equal(await nativeVisible(),false);
  assert.equal(await page.locator('#home-page').evaluate(node=>getComputedStyle(node).visibility),'hidden');
 };
 const bounds=()=>app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows()[0].contentView.children.find(view=>view.webContents?.id===id).getBounds(),id);
 await page.evaluate(()=>window.browser.command('overlay',false));
 const original=await bounds();
 const runOnSite=code=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code),{id,code});
 await runOnSite(`(async()=>{
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d');
  const video=document.createElement('video');
  video.id='test-video';video.muted=true;video.style.position='fixed';
  document.body.prepend(video);
  video.srcObject=canvas.captureStream(15);
  setInterval(()=>{ctx.fillStyle=ctx.fillStyle==='#000000'?'white':'black';ctx.fillRect(0,0,32,32);},60);
  await video.play();
 })()`);
 const docked=async (selector,side)=>{
  const panel=page.locator(selector);
  await panel.waitFor();
  await page.waitForFunction(()=>document.body.classList.contains('site-overlay-open'));
  assert.equal(await nativeVisible(),true);
  assert.equal(await page.locator('#site-overlay-background').isVisible(),false);
  const box=await panel.boundingBox();
  let site;
  for(let attempt=0;attempt<30;attempt++){
   site=await bounds();
   if(site.width<original.width&&(side==='left'?site.x>=box.x+box.width:site.x+site.width<=box.x))break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert(site.width<original.width, JSON.stringify({site,original,box}));
  assert(side==='left'?site.x>=box.x+box.width:site.x+site.width<=box.x);
  await runOnSite(`new Promise((resolve,reject)=>{
   const video=document.getElementById('test-video');
   const start=video.currentTime;
   const deadline=setTimeout(()=>reject(new Error('Video stopped advancing with a panel open')),2000);
   function check(){
    if(video.currentTime>start&&!video.paused){clearTimeout(deadline);resolve(true);}
    else requestAnimationFrame(check);
   }
   check();
  })`);
 };
 await page.locator('#favorites-button').click();await covered('#favorites');
 await page.locator('#downloads-button').click();await docked('#downloads-panel','left');
 await page.locator('#ai-assistant-button').click();await docked('#ai-assistant','right');
 await page.locator('#ai-prompt').fill('Unsaved question');
 assert.equal(await page.locator('#ai-prompt').inputValue(),'Unsaved question');
 await page.locator('#downloads-button').click();await docked('#downloads-panel','left');
 await page.locator('#close-downloads').click();
 await page.waitForFunction(()=>!document.body.classList.contains('site-overlay-open'));
 assert.deepEqual(await bounds(),original);
 await page.locator('#ai-assistant-button').click();await docked('#ai-assistant','right');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.body.classList.contains('site-overlay-open'));
 assert.deepEqual(await bounds(),original);
 await page.locator('#address').click();await covered('#search-suggestions');
 await page.keyboard.press('Escape');
 await page.locator('#site-overlay-background').waitFor({state:'hidden'});assert.equal(await nativeVisible(),true);
 const state=await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('({url:location.href,scroll:scrollY,draft:document.getElementById("draft").value})'),id);
 assert.deepEqual(state,{url,scroll:420,draft:'unsaved text'});
 assert.equal(await app.evaluate(()=>global.__captureCalls),0);assert.deepEqual(errors,[]);
 console.log('PASS: downloads, AI, favorites and address dropdown stay responsive without capture; switching and closing restore the same website and its form state');
 }finally{await app.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
