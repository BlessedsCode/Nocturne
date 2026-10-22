const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const profile=path.resolve('artifacts','layout-profile-'+Date.now());
 const launch=()=>require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 let app=await launch();
 try{
  let page=await app.firstWindow();await page.waitForSelector('.tab');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await page.screenshot({path:'artifacts/layout-home.png'});
  const search=page.locator('[data-widget=search]'),links=page.locator('[data-widget=links]');
  const initial=await search.boundingBox(),initialLinks=await links.boundingBox();
  async function drag(handle,dx,dy){const a=await handle.boundingBox();const x=a.x+a.width/2,y=a.y+a.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();}
  await page.locator('#edit-home-layout').click();assert.equal(await page.locator('#search').evaluate(el=>el.closest('form').inert),true);
  await drag(page.locator('#move-home-search'),-230,-260);
  let moved=await search.boundingBox();assert(moved.x<initial.x-200&&moved.y<initial.y-230);
  assert.deepEqual(await links.boundingBox(),initialLinks);
  await drag(page.locator('#resize-home-search'),75,0);
  assert(Math.abs((await search.boundingBox()).width-initial.width-150)<2);
  await drag(page.locator('#move-home-links'),190,-90);
  assert((await links.boundingBox()).x>initialLinks.x+160);
  await page.screenshot({path:'artifacts/layout-edit.png'});
  await page.locator('#layout-done').click();
  const stored=await page.evaluate(()=>localStorage.getItem('home-layout-v1'));
  assert(JSON.parse(stored).search&&JSON.parse(stored).links);
  const committed=await search.boundingBox();
  await page.locator('#edit-home-layout').click();await drag(page.locator('#move-home-search'),80,-60);await page.keyboard.press('Escape');
  assert.deepEqual(await search.boundingBox(),committed);
  assert.equal(await page.locator('#search').evaluate(el=>el.closest('form').inert),false);
  await page.locator('#edit-home-layout').click();await page.locator('#layout-reset').click();await page.locator('#layout-cancel').click();assert.deepEqual(await search.boundingBox(),committed);
  // Native close/relaunch exercises profile persistence rather than just DOM state.
  await app.close();app=await launch();page=await app.firstWindow();await page.waitForSelector('.tab');
  assert.equal(await page.evaluate(()=>localStorage.getItem('home-layout-v1')),stored);
  const relaunched=await page.locator('[data-widget=search]').boundingBox();assert(Math.abs(relaunched.x-committed.x)<1&&Math.abs(relaunched.y-committed.y)<1);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,700));
  await page.waitForTimeout(150);
  const bounds=await page.locator('#home-page').boundingBox();
  for(const id of ['search','links']){const a=await page.locator('[data-widget='+id+']').boundingBox();assert(a.x>=bounds.x&&a.y>=bounds.y&&a.x+a.width<=bounds.x+bounds.width&&a.y+a.height<=bounds.y+bounds.height);}
  await page.locator('#settings-button').click();await page.locator('[data-section=appearance]').click();await page.locator('#settings-edit-layout').click();await page.waitForSelector('.editing-layout');
  // Keyboard adjustments and reset both use the same persisted draft.
  await page.locator('#move-home-search').focus();await page.keyboard.press('Shift+ArrowRight');await page.locator('#layout-done').click();
  await page.locator('#edit-home-layout').click();await page.locator('#layout-reset').click();await page.locator('#layout-done').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('home-layout-v1')),'{}');
  await page.locator('#settings-button').click();await page.locator('[data-section=appearance]').click();await page.locator('#show-home-links').uncheck();await page.locator('#close-settings').click();await page.locator('#settings').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-widget=links]').isVisible(),false);
  await page.locator('#settings-button').click();await page.locator('[data-section=appearance]').click();await page.locator('#show-home-links').check();await page.locator('#close-settings').click();await page.locator('#settings').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-widget=links]').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: independent pointer dragging; resize; save and native restart; Escape and cancel restore; responsive bounds; settings entry; keyboard movement; reset; hidden links');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
