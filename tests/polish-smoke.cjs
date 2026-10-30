const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const profile=path.resolve('artifacts','polish-profile-'+Date.now());const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.tab');
 async function checkCenters(){
  const deltas=await page.evaluate(()=>['settings-button','back','forward','reload','new','home','favorites-button','downloads-button','security-button','bookmark'].map(id=>{const button=document.getElementById(id),svg=button.querySelector(':scope>svg'),a=button.getBoundingClientRect(),b=svg.getBoundingClientRect();return {id,dx:Math.abs((a.left+a.width/2)-(b.left+b.width/2)),dy:Math.abs((a.top+a.height/2)-(b.top+b.height/2))};}));
  for(const d of deltas){assert(d.dx<=.6,JSON.stringify(d));assert(d.dy<=.6,JSON.stringify(d));}
  const rows=await page.evaluate(()=>['settings-button','back','reload','security-button','bookmark'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top+r.height/2;}));assert(Math.max(...rows)-Math.min(...rows)<=.6);
 }
 await checkCenters();await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'artifacts/aligned-home.png'});
 await page.locator('#security-button').click();await page.locator('#connect-cloud').click();await page.waitForFunction(()=>document.querySelector('#cloud-test-result').textContent.includes('Сначала вставь'));
 assert.equal(await page.locator('#cloud-protection').isChecked(),false);
 await app.evaluate(({net})=>{const original=net.fetch.bind(net);global.__probeRequests=[];global.__denyProbe=true;net.fetch=async(url,options)=>{if(String(url).startsWith('https://safebrowsing.googleapis.com/')){global.__probeRequests.push(JSON.parse(options.body).threatInfo.threatEntries[0].url);if(global.__denyProbe)return new Response(JSON.stringify({error:{details:[{reason:'SERVICE_DISABLED'}]}}),{status:403});return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});}return original(url,options);};});
 await page.locator('#security-api-key').fill('SYNTHETIC_FRIEND_KEY');await page.locator('#connect-cloud').click();await page.waitForFunction(()=>document.querySelector('#cloud-test-result').dataset.state==='error');assert.match(await page.locator('#cloud-test-result').textContent(),/Включи выбранный API/);assert.equal(await page.locator('#cloud-protection').isChecked(),false);
 await app.evaluate(()=>{global.__denyProbe=false;});await page.locator('#connect-cloud').click();await page.waitForFunction(()=>document.querySelector('#cloud-test-result').dataset.state==='success');assert.equal(await page.locator('#cloud-protection').isChecked(),true);
 assert.equal((await fs.readFile(path.join(profile,'security','security-key.enc'))).includes(Buffer.from('SYNTHETIC_FRIEND_KEY')),false);
 assert.deepEqual(await app.evaluate(()=>global.__probeRequests),['https://example.com/','https://example.com/']);
 await page.locator('#test-cloud').click();await page.waitForFunction(()=>!document.querySelector('#test-cloud').disabled);assert.equal(await app.evaluate(()=>global.__probeRequests.length),3);
 await app.evaluate(({shell})=>{shell.openExternal=async url=>{global.__helpURL=url;};});await page.locator('#cloud-open-console').click();assert.equal(await app.evaluate(()=>global.__helpURL),'https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com');
 await page.locator('#cloud-open-guide').scrollIntoViewIfNeeded();await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'artifacts/cloud-setup.png'});
 await page.locator('#close-settings').click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,700));await checkCenters();assert.deepEqual(errors,[]);
 console.log('PASS: SVG button centers and toolbar baseline at 1480/1000px; absent/disabled API errors; explicit fixed-URL connection test; successful activation only after Google response; encrypted personal key; repeated uncached checks; official help links');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
