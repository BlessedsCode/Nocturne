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
 await page.locator('#favorites-button').click();await page.waitForSelector('body.site-overlay-open');await page.waitForFunction(()=>document.getElementById('site-overlay-background').naturalWidth>0);
 assert.equal(await page.locator('#home-page').evaluate(node=>getComputedStyle(node).visibility),'hidden');await page.screenshot({path:'artifacts/site-with-favorites.png'});
 await page.locator('#close-favorites').click();await page.locator('#site-overlay-background').waitFor({state:'hidden'});
 let state=await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('({url:location.href,scroll:scrollY,draft:document.getElementById("draft").value})'),id);assert.deepEqual(state,{url,scroll:420,draft:'unsaved text'});
 await page.locator('#settings-button').click();await page.waitForSelector('body.site-overlay-open');assert.equal(await page.locator('#settings').isVisible(),true);await page.locator('#close-settings').click();await page.locator('#site-overlay-background').waitFor({state:'hidden'});
 await page.locator('#address').click();await page.waitForSelector('#search-suggestions:not([hidden])');await page.waitForSelector('body.site-overlay-open');await page.keyboard.press('Escape');await page.locator('#site-overlay-background').waitFor({state:'hidden'});
 state=await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('({url:location.href,scroll:scrollY,draft:document.getElementById("draft").value})'),id);assert.deepEqual(state,{url,scroll:420,draft:'unsaved text'});
 console.log('PASS: favorites, settings and address dropdown retain website backdrop; home hidden; exact same document, scroll position and unsaved input after closing overlays');
 }finally{await app.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
