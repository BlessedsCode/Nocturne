const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),http=require('node:http');
const profile=path.resolve('artifacts','settings-profile-'+Date.now());
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
const settle=page=>page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
(async()=>{
 let dnt='',nextSeen;const nextRequested=new Promise(resolve=>nextSeen=resolve);
 const server=http.createServer((req,res)=>{
  if(req.url==='/next'){dnt=req.headers.dnt||'';nextSeen();}
  if(req.url==='/assets/mark.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#a878b0"/><circle cx="16" cy="16" r="7" fill="white"/></svg>');}
  if(req.url==='/download'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="sample.txt"'});return res.end('nocturne synthetic download');}
  if(req.url==='/favicon.ico'){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':'nocturne=synthetic; Path=/'});res.end('<title>Test Observatory</title><link href="/assets/mark.svg" rel="icon"><h1>Test Observatory</h1>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let app=await launch();
 try{
 let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.tab');
 assert.equal(await page.locator('.online,.topline,footer').count(),0);
 await page.locator('.add-quick-link').click();await page.locator('#link-name').fill('Observatory');await page.locator('#link-url').fill(base);await page.locator('#save-link').click();await page.locator('#close-links').click();
 await page.waitForFunction(()=>{const items=[...document.querySelectorAll('.quick-link')];return items.some(e=>e.textContent.includes('Observatory')&&e.querySelector('img')?.naturalWidth>0);});
 await page.waitForFunction(()=>document.querySelector('#rail-links [title="Observatory"] img')?.naturalWidth>0);
 assert.equal(await page.locator('.quick-link').filter({hasText:'Observatory'}).locator('img').getAttribute('src').then(s=>s.startsWith('data:image/svg+xml')),true);
 await settle(page);await page.screenshot({path:'artifacts/clean-home.png'});
 await page.locator('.quick-link').filter({hasText:'Observatory'}).hover();await page.locator('.quick-link').filter({hasText:'Observatory'}).locator('.unpin-link').click();
 assert.equal(await page.locator('.quick-link').filter({hasText:'Observatory'}).count(),0);assert.equal(await page.locator('#rail-links [title="Observatory"]').count(),1);
 await page.locator('#rail-links [title="Observatory"]').click();await page.waitForFunction(()=>document.querySelector('.tab-title').textContent==='Test Observatory');await page.waitForFunction(()=>document.querySelector('.tab .site-icon img')?.naturalWidth>0);
 await page.locator('#settings-button').click();await page.locator('[data-section="appearance"]').click();await page.locator('#page-zoom').selectOption('150');
 await page.waitForFunction(async()=>{const s=await window.browser.command('settings-get');return s.zoom===150;});
 assert.equal(await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1')).getZoomFactor()),1.5);
 await page.locator('#settings-search').fill('масштаб');assert.equal(await page.locator('#appearance-section').isVisible(),true);assert.equal(await page.locator('#privacy-section').isVisible(),false);
 await page.locator('[data-section="general"]').click();await page.locator('#restore-session').check();
 await page.locator('[data-section="privacy"]').click();await page.locator('#do-not-track').check();await page.locator('#media-permission').selectOption('ask');
 await settle(page);await page.screenshot({path:'artifacts/browser-settings.png'});
 await page.locator('#close-settings').click();await page.locator('#address').fill(base+'/next');await page.locator('#address').press('Enter');await page.waitForFunction(()=>document.querySelector('#address').value.endsWith('/next'));await page.waitForFunction(()=>!document.querySelector('#reload').classList.contains('is-loading'));await Promise.race([nextRequested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No /next request')),5000))]);assert.equal(dnt,'1');
 await page.locator('#settings-button').click();await page.locator('[data-section="history"]').click();await page.waitForSelector('.history-entry');assert.match(await page.locator('#history-list').textContent(),/Test Observatory/);
 const directory=path.join(profile,'files');await fs.mkdir(directory,{recursive:true});await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},directory);
 await page.locator('[data-section="download-settings"]').click();await page.locator('#choose-download-directory').click();await page.waitForFunction(()=>document.querySelector('#download-directory').textContent.endsWith('files'));await page.locator('#ask-download').uncheck();
 await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL().startsWith(url)).downloadURL(url+'/download'),base);
 await page.locator('#downloads-button').click();await page.waitForFunction(()=>document.querySelector('.download-row small')?.textContent.includes('Готово')); assert.equal(await fs.readFile(path.join(directory,'sample.txt'),'utf8'),'nocturne synthetic download');
 await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL().startsWith(url)).downloadURL(url+'/download'),base);
 await page.waitForFunction(()=>[...document.querySelectorAll('.download-row small')].filter(e=>e.textContent.includes('Готово')).length===2);assert.equal(await fs.readFile(path.join(directory,'sample (1).txt'),'utf8'),'nocturne synthetic download');
 await page.locator('#settings-button').click();await page.locator('[data-section="privacy"]').click();await page.locator('#clear-history').check();await page.locator('#clear-cookies').check();await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});await page.locator('#clear-data').click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Выбранные данные удалены');assert.equal((await page.evaluate(()=>window.browser.command('history-list'))).length,0);
 assert.equal(await app.evaluate(async({session},url)=>(await session.fromPartition('persist:nocturne').cookies.get({url})).length,base),0);
 assert.deepEqual(errors,[]);
 await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('.tab-title')?.textContent==='Test Observatory');
 await page.locator('#settings-button').click();await page.locator('[data-section="appearance"]').click();await page.waitForFunction(()=>document.querySelector('#page-zoom').value==='150');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,700));await settle(page);await page.screenshot({path:'artifacts/settings-small.png'});
 assert.equal(await page.locator('#settings').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 console.log('PASS: favicon discovered from site HTML and shown on home/rail/tab; independent unpin; settings search; real page zoom; DNT; history + cookie cleanup; automatic download directory + collision handling; persisted settings + session restoration; compact layout');
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
