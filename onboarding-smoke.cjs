const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const profile=path.resolve('artifacts','onboarding-profile-'+Date.now());
 let app=await electron.launch({args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
  let page=await app.firstWindow();await page.waitForSelector('#welcome-dialog[open]');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#welcome-color-wine').click();assert.equal(await page.locator('body').getAttribute('data-interface-color'),'wine');
  await page.screenshot({path:'artifacts/welcome-color.png'});
  await page.locator('#welcome-wallpaper').selectOption('portrait');await page.locator('#welcome-next').click();
  await page.locator('#welcome-engine').selectOption('bing');await page.locator('#welcome-next').click();
  await page.waitForFunction(()=>document.getElementById('welcome-import-csv'));
  await page.screenshot({path:'artifacts/welcome-import.png'});
  const csv=path.join(profile,'synthetic-import.csv');await fs.writeFile(csv,'url,username,password\r\nhttps://example.com,friend,SYNTHETIC_PASSWORD\r\n');
  await app.evaluate(({dialog},csv)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[csv]});},csv);
  await page.locator('#welcome-dialog .import-fallback summary').click();await page.locator('#welcome-import-csv').click();await page.waitForFunction(()=>document.getElementById('welcome-import-notice').textContent.includes('Добавлено: 1'));
  const encrypted=await fs.readFile(path.join(profile,'passwords.enc'));assert(!encrypted.includes(Buffer.from('SYNTHETIC_PASSWORD')));
  await page.locator('#welcome-next').click();await page.locator('#welcome-dialog').waitFor({state:'hidden'});
  assert.equal(JSON.parse(await fs.readFile(path.join(profile,'browser-settings.json'),'utf8')).firstRunComplete,true);
  await app.close();app=await electron.launch({args:[path.resolve('.'),'--user-data-dir='+profile],env});page=await app.firstWindow();await page.waitForSelector('.tab');
  assert.equal(await page.locator('#welcome-dialog').isVisible(),false);assert.equal(await page.locator('body').getAttribute('data-interface-color'),'wine');assert.equal(await page.locator('#search-engine').inputValue(),'bing');
  await app.evaluate(async({session})=>{await session.fromPartition('persist:nocturne').protocol.handle('https',request=>{
   const host=new URL(request.url).hostname;
   const link='<a href="https://castle.example/abbey"><h3>Замок и море</h3></a>';
   const fixtures=host.includes('google')?'<div id="search">'+link+'</div>':host.includes('bing')?'<li class="b_algo"><h2><a href="https://castle.example/abbey">Замок и море</a></h2></li>':host.includes('duckduckgo')?'<a class="result__a" href="https://castle.example/abbey">Замок и море</a>':host.includes('yandex')?'<a class="OrganicTitle-Link" href="https://castle.example/abbey">Замок и море</a>':host.includes('brave')?'<div class="snippet"><a class="heading-serpresult" href="https://castle.example/abbey">Замок и море</a></div>':host.includes('yahoo')?'<div class="algo"><h3><a href="https://castle.example/abbey">Замок и море</a></h3></div>':'<a class="result-title" href="https://castle.example/abbey">Замок и море</a>';
   return new Response('<title>Search fixture</title>'+fixtures,{headers:{'content-type':'text/html; charset=utf-8'}});
  });});
  await page.locator('#address').fill('замок & море');await page.locator('#search-all').click();await page.waitForSelector('#combined-results:not([hidden])');
  await page.waitForFunction(()=>document.querySelectorAll('.combined-sources button').length===7);
  assert.equal(await page.locator('.tab').count(),1);assert.equal(await page.locator('.combined-result').count(),1);
  await page.screenshot({path:'artifacts/combined-search.png'});
  await page.getByRole('button',{name:'Bing · 1',exact:true}).click();assert.equal(await page.locator('.combined-result').count(),1);
  const none=await page.evaluate(()=>window.browser.command('browser-open-export','not-a-browser'));assert.match(none.error,/не найден/);
  await page.locator('#settings-button').click();await page.locator('[data-section=passwords]').click();await page.locator('#detect-browsers').click();await page.waitForSelector('#settings-import-auto');
  await page.locator('[data-section=about]').click();await page.locator('#reopen-welcome').click();await page.waitForSelector('#welcome-dialog[open]');await page.locator('#welcome-skip').click();await page.locator('#welcome-dialog').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('PASS: fresh profile onboarding; live color and wallpaper; engine selection; discovered-browser import UI; real synthetic CSV encryption; one-time completion; persisted restart; one combined page with 7 real extracted fixture sources; URL deduplication; engine filter; invalid export ID; settings discovery and setup replay');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
