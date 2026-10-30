const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
(async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(req.url==='/missing'?404:200,{'content-type':'text/html'});res.end('<title>'+req.url+'</title><h1>Navigation fixture</h1>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+path.resolve('artifacts','recovery-profile-'+Date.now())],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('UI ERROR:',error.message);});await page.waitForSelector('.tab');
  await page.locator('#address').blur();await page.keyboard.press('Escape');
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  await command('navigate',base+'/ok');await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('/ok'));
  await command('navigate',base+'/missing');await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('/missing')&&document.getElementById('error-page').hidden);
  assert.equal(await page.locator('#error-page').isVisible(),false,'HTTP 404 documents stay visible');
  await command('back');await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('/ok')&&document.getElementById('error-page').hidden);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible()),true);
  await command('forward');await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('/missing')&&document.getElementById('error-page').hidden);
  await command('navigate','nocturne://home');await page.waitForFunction(()=>!document.getElementById('reload').classList.contains('is-loading'));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.length),0);
  await command('navigate',base+'/crash');await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('/crash'));
  await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url).forcefullyCrashRenderer(),base+'/crash');
  await page.waitForSelector('#error-page:not([hidden])');await command('reload');await page.waitForFunction(()=>document.getElementById('error-page').hidden&&!document.getElementById('reload').classList.contains('is-loading'));
  for(let i=0;i<8;i++){await command('open-tab',base+'/closing-'+i);await command('browser-action','close-tab');}
  await page.locator('#address').click();await page.waitForSelector('#search-suggestions:not([hidden])');await page.evaluate(()=>openCombinedSearch('navigation fixture'));await page.locator('#search-suggestions').waitFor({state:'hidden'});assert.equal(await page.locator('#combined-results').isVisible(),true);await page.locator('#close-combined').click();
  await page.evaluate(()=>{localStorage.setItem('quick-links','{}');localStorage.setItem('favorites','[null]');localStorage.setItem('favicons','{"https://example.com":null}');});await page.reload();await page.waitForSelector('.tab');assert.deepEqual(errors,[]);
  console.log('PASS: HTTP error documents stay visible and recover through history; home clears loading and native view; crashed renderer reloads; rapid tab closing; search suggestions yield to combined results; malformed local UI storage recovers');
 }finally{await app.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
