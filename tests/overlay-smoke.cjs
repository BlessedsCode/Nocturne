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
 await page.locator('#favorites-button').click();await covered('#favorites');
 await page.locator('#downloads-button').click();await covered('#downloads-panel');
 await page.locator('#ai-assistant-button').click();await covered('#ai-assistant');
 await page.locator('#ai-prompt').fill('Unsaved question');
 assert.equal(await page.locator('#ai-prompt').inputValue(),'Unsaved question');
 await page.locator('#downloads-button').click();await covered('#downloads-panel');
 await page.locator('#close-downloads').click();
 await page.locator('#site-overlay-background').waitFor({state:'hidden'});assert.equal(await nativeVisible(),true);
 await page.locator('#ai-assistant-button').click();await covered('#ai-assistant');
 await page.keyboard.press('Escape');
 await page.locator('#site-overlay-background').waitFor({state:'hidden'});assert.equal(await nativeVisible(),true);
 await page.locator('#address').click();await covered('#search-suggestions');
 await page.keyboard.press('Escape');
 await page.locator('#site-overlay-background').waitFor({state:'hidden'});assert.equal(await nativeVisible(),true);
 const state=await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('({url:location.href,scroll:scrollY,draft:document.getElementById("draft").value})'),id);
 assert.deepEqual(state,{url,scroll:420,draft:'unsaved text'});
 assert.equal(await app.evaluate(()=>global.__captureCalls),0);assert.deepEqual(errors,[]);
 console.log('PASS: downloads, AI, favorites and address dropdown stay responsive without capture; switching and closing restore the same website and its form state');
 }finally{await app.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
