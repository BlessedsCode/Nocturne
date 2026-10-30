const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const profile=path.resolve('artifacts','suggestions-profile-'+Date.now());await fs.mkdir(profile,{recursive:true});
 await fs.writeFile(path.join(profile,'history.json'),JSON.stringify([{url:'https://example.com/',title:'Example Domain',time:Date.now(),visits:5},{url:'https://www.youtube.com/',title:'YouTube',time:Date.now()-5000},{url:'https://github.com/',title:'GitHub',time:Date.now()-10000}]));
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.tab');
 await app.evaluate(({net})=>{const original=net.fetch.bind(net);global.__suggestRequests=[];net.fetch=async(url,options)=>{if(String(url).includes('/complete/search')||String(url).includes('duckduckgo.com/ac/')||String(url).includes('suggest-ff.cgi')){global.__suggestRequests.push(String(url));const u=new URL(url),q=u.searchParams.get('q')||u.searchParams.get('part');await new Promise(r=>setTimeout(r,q==='slow'?650:30));return new Response(JSON.stringify([q,[q+' castle',q+' abbey',q+' meadow']]));}return original(url,options);};});
 await page.locator('#search').click();await page.waitForSelector('#search-suggestions:not([hidden])');
 assert.match(await page.locator('#search-suggestions').textContent(),/Недавно/);assert.match(await page.locator('#search-suggestions').textContent(),/Часто/);
 assert.equal(await app.evaluate(()=>global.__suggestRequests.length),0);
 await page.screenshot({path:'artifacts/suggestions-recent.png'});
 await page.locator('.suggestion-option').filter({hasText:'Example Domain'}).locator('.suggestion-dismiss').click();
 await page.waitForFunction(()=>!document.getElementById('search-suggestions').textContent.includes('Example Domain'));
 assert.equal(await page.locator('#search').evaluate(node=>document.activeElement===node),true);assert.equal((await page.evaluate(()=>window.browser.command('history-list'))).length,3);assert.equal(await page.locator('.tab').count(),1);assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile,'dismissed-suggestions.json'),'utf8')),['https://example.com']);
 await page.locator('#search').fill('mont');await page.waitForFunction(()=>document.querySelector('#search-suggestions').textContent.includes('mont castle'));
 const a=await page.locator('#search-suggestions').boundingBox(),b=await page.locator('#search').boundingBox();assert(a.y+a.height<b.y);
 await page.screenshot({path:'artifacts/suggestions-query.png'});
 await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#search').getAttribute('aria-activedescendant'),'suggestion-0');await page.keyboard.press('Escape');assert.equal(await page.locator('#search-suggestions').isVisible(),false);
 await page.locator('#search').fill('slow');await page.waitForTimeout(250);await page.locator('#search').fill('fast');await page.waitForFunction(()=>document.querySelector('#search-suggestions').textContent.includes('fast castle'));await page.waitForTimeout(500);assert(!(await page.locator('#search-suggestions').textContent()).includes('slow castle'));
 const before=await app.evaluate(()=>global.__suggestRequests.length);await page.locator('#search').fill('https://example.com/private?token=secret');await page.waitForTimeout(400);assert.equal(await app.evaluate(()=>global.__suggestRequests.length),before);
 await page.locator('#address').click();await page.locator('#address').fill('Example');await page.waitForSelector('.suggestion-row');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.tab.active .tab-title').textContent.includes('Example Domain'));
 await page.locator('#address').click();await page.locator('#address').fill('mont');await page.waitForFunction(()=>document.querySelector('#search-suggestions').textContent.includes('mont castle'));assert.equal(await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL()==='https://example.com/').getURL()),'https://example.com/');
 assert.equal(await page.locator('#suggestion-backdrop').isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#suggestion-backdrop').isVisible(),false);
 await page.locator('#settings-button').click();await page.locator('[data-section=general]').click();await page.locator('#online-suggestions').uncheck();await page.locator('#close-settings').click();await page.locator('#settings').waitFor({state:'hidden'});
 await page.locator('#address').fill('offline test');await page.locator('#address').click();const count=await app.evaluate(()=>global.__suggestRequests.length);await page.waitForTimeout(450);assert.equal(await app.evaluate(()=>global.__suggestRequests.length),count);assert.match(await page.locator('#search-suggestions').textContent(),/выключены/);
 assert.deepEqual(errors,[]);console.log('PASS: recent/frequent sites; no requests on focus; online completions; upward positioning; keyboard navigation; stale response rejection; private URL suppression; real history navigation; address dropdown over a website; opt out');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
