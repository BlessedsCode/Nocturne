const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),http=require('node:http');
const profile=path.resolve('artifacts','security-profile-'+Date.now());
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const settle=page=>page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
(async()=>{
 await fs.mkdir(path.join(profile,'security'),{recursive:true});await fs.writeFile(path.join(profile,'security','threats.txt'),'danger.nocturne.test\n');await fs.writeFile(path.join(profile,'security','trackers.txt'),'tracker.nocturne.test\n');
 let plainRequests=0;
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'https://danger.nocturne.test/landing'});return res.end();}
  if(req.url==='/download'){res.writeHead(200,{'Content-Disposition':'attachment; filename="safe.txt"','Content-Type':'application/octet-stream'});return res.end('Harmless Nocturne integration test file.');}
  if(req.url==='/plain')plainRequests++;
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Security fixture</title><h1>Security fixture</h1><img src="https://tracker.nocturne.test/pixel">');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile,'--host-resolver-rules=MAP plain.nocturne.test 127.0.0.1','--no-proxy-server'],env});
 try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.tab');assert.equal(await page.locator('.rail-add').count(),0);assert.equal(await page.locator('.add-quick-link').count(),1);
 async function navigate(url){await page.locator('#address').fill(url);await page.locator('#address').press('Enter');}
 await navigate(base);await page.waitForFunction(()=>document.querySelector('.tab-title').textContent==='Security fixture');
 await page.locator('#security-button').click();await page.waitForFunction(()=>document.querySelector('#security-log').textContent.includes('tracker.nocturne.test'));
 assert.equal(await app.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1'));return wc.executeJavaScript(`typeof require==='undefined'&&typeof process==='undefined'&&typeof window.browser==='undefined'`);}),true);
 const sandbox=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1')).getLastWebPreferences());assert.equal(sandbox.sandbox,true);assert.equal(sandbox.contextIsolation,true);assert.equal(sandbox.nodeIntegration,false);assert.equal(sandbox.webSecurity,true);
 await settle(page);await page.screenshot({path:'artifacts/security-settings.png'});await page.locator('#close-settings').click();
 await navigate('http://plain.nocturne.test:'+server.address().port+'/plain');await page.waitForSelector('#security-warning:not([hidden])');assert.equal(plainRequests,0);assert.equal(await page.locator('#warning-http').isVisible(),true);
 await page.locator('#warning-http').click();await page.waitForFunction(()=>document.querySelector('#security-warning').hidden);await page.waitForFunction(()=>document.querySelector('.tab-title').textContent==='Security fixture');
 assert.equal(plainRequests,1);
 await navigate(base+'/redirect');await page.waitForSelector('#security-warning:not([hidden])');assert.match(await page.locator('#warning-message').textContent(),/локальном списке/);assert.equal(await page.locator('#warning-http').isVisible(),false);
 await settle(page);await page.screenshot({path:'artifacts/security-blocked.png'});
 await page.locator('#warning-home').click();await page.locator('#security-button').click();
 await page.locator('#security-api-key').fill('NOCTURNE_SYNTHETIC_KEY');await page.locator('#save-security-key').click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.includes('Ключ сохранён'));
 assert.equal((await fs.readFile(path.join(profile,'security','security-key.enc'))).includes(Buffer.from('NOCTURNE_SYNTHETIC_KEY')),false);
 await app.evaluate(({net})=>{const original=net.fetch.bind(net);global.__cloudCalls=0;net.fetch=async(url,options)=>{if(String(url).startsWith('https://safebrowsing.googleapis.com/')){global.__cloudCalls++;if(global.__cloudFail)throw new Error('offline fixture');const target=JSON.parse(options.body).threatInfo.threatEntries[0].url;return new Response(JSON.stringify(target.includes('cloud-threat')?{matches:[{threatType:'SOCIAL_ENGINEERING'}]}:{}),{status:200,headers:{'Content-Type':'application/json'}});}return original(url,options);};});
 await page.locator('#cloud-protection').check();await page.locator('#close-settings').click();await navigate('https://cloud-threat.nocturne.test');await page.waitForSelector('#security-warning:not([hidden])');assert.match(await page.locator('#warning-message').textContent(),/Google/);
 await app.evaluate(()=>{global.__cloudFail=true;});await navigate('https://unavailable.nocturne.test');await page.waitForFunction(()=>document.querySelector('#warning-message').textContent.includes('Облачная проверка недоступна'));assert.equal(await page.locator('#warning-http').isVisible(),false);
 assert.equal(await app.evaluate(()=>global.__cloudCalls),2);
 await page.locator('#warning-settings').click();await page.locator('#cloud-protection').uncheck();await page.locator('#remove-security-key').click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.includes('Ключ не настроен'));await page.locator('#close-settings').click();await navigate(base);await page.waitForFunction(()=>document.querySelector('.tab-title').textContent==='Security fixture');
 const directory=path.join(profile,'files');await fs.mkdir(directory,{recursive:true});await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},directory);
 await page.evaluate(()=>window.browser.command('choose-download-directory'));await page.evaluate(()=>window.browser.command('settings-update',{askDownload:false}));
 await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL().startsWith(url)).downloadURL(url+'/download'),base);
 await page.locator('#downloads-button').click();await page.waitForSelector('.download-scan[data-state="clean"]',{timeout:45000});assert.equal(await fs.readFile(path.join(directory,'safe.txt'),'utf8'),'Harmless Nocturne integration test file.');
 assert.match(await fs.readFile(path.join(directory,'safe.txt:Zone.Identifier'),'utf8'),/ZoneId=3/);
 await app.evaluate(({shell})=>{shell.openPath=async file=>{global.__openedFile=file;return '';};});await page.getByText('Открыть ↗',{exact:true}).click();assert.equal(await app.evaluate(()=>global.__openedFile.endsWith('safe.txt')),true);
 await settle(page);await page.screenshot({path:'artifacts/security-download.png'});assert.deepEqual(errors,[]);
 console.log('PASS: sidebar plus removed; real navigation/redirect blocking; tracker filtering; HTTP interstitial + explicit override; sandbox + no privileged bridge; encrypted cloud key; mocked Google threat + outage block; real Defender benign-file scan; Windows internet-zone marking; checked file opening');
 }finally{await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
