const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const profile=path.resolve('artifacts','drag-region-profile-'+Date.now());
// Chromium builds the native window drag region from every element with
// -webkit-app-region:drag, minus the boxes of its no-drag *descendants*.
// A no-drag sibling painted on top does not punch a hole, so real mouse clicks
// there are consumed by the OS and never reach the page (Playwright's
// synthetic clicks bypass this, which is why this needs an explicit check).
const blockedAt=(points)=>points.map(([x,y])=>{
 const inside=(r,px,py)=>px>=r.left&&px<r.right&&py>=r.top&&py<r.bottom;
 const drags=[...document.querySelectorAll('header,#tabs,nav,.rail,.topline,footer')]
  .filter(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')==='drag')
  .map(el=>el.getBoundingClientRect());
 const holes=[];
 for(const el of document.querySelectorAll('header *,#tabs *,nav *,.rail *,.topline *,footer *')){
  if(getComputedStyle(el).getPropertyValue('-webkit-app-region')==='no-drag')holes.push(el.getBoundingClientRect());
 }
 return {x,y,blocked:drags.some(r=>inside(r,x,y))&&!holes.some(r=>inside(r,x,y))};
});
(async()=>{
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.tab');
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));

  const layout=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
   const gear=document.getElementById('settings-button');
   const find=document.getElementById('page-find');
   // Keep the find bar visible for the hit-test probe below.
   find.hidden=false;
   return {
    gear:{...rect(gear),parent:gear.parentElement.tagName,region:getComputedStyle(gear).getPropertyValue('-webkit-app-region')},
    nav:rect(document.querySelector('nav')),
    find:{...rect(find),parent:find.parentElement.tagName}
   };
  });
  // The gear must sit inside the toolbar so its no-drag box cuts the drag region.
  assert.equal(layout.gear.parent,'NAV');
  assert.equal(layout.gear.region,'no-drag');
  assert.deepEqual({x:layout.gear.x,y:layout.gear.y,w:layout.gear.w,h:layout.gear.h},{x:19,y:61,w:38,h:38});
  assert.equal(layout.find.parent,'NAV');

  const probes=await page.evaluate(blockedAt,[
   [layout.gear.x+layout.gear.w/2,layout.gear.y+layout.gear.h/2],
   [layout.find.x+layout.find.w/2,layout.find.y+layout.find.h/2],
   [layout.gear.x+layout.gear.w+15,layout.nav.y+30]
  ]);
  assert.equal(probes[0].blocked,false,'settings button is inside the window drag region');
  assert.equal(probes[1].blocked,false,'find bar is inside the window drag region');
  assert.equal(probes[2].blocked,true,'empty toolbar area should still drag the window');
  await page.evaluate(()=>{document.getElementById('page-find').hidden=true;});

  // The address dropdown must never overlap the drag band.
  await page.evaluate(()=>document.getElementById('address').focus());
  await page.waitForSelector('#search-suggestions:not([hidden])');
  const drop=await page.evaluate(()=>{
   const r=document.getElementById('search-suggestions').getBoundingClientRect();
   const nav=document.querySelector('nav').getBoundingClientRect();
   return {x:r.x,y:r.y,w:r.width,h:r.height,navBottom:nav.bottom};
  });
  assert(drop.y>=drop.navBottom-0.5,'dropdown overlaps the toolbar drag region');
  const [dropProbe]=await page.evaluate(blockedAt,[[drop.x+drop.w/2,drop.y+1]]);
  assert.equal(dropProbe.blocked,false,'dropdown top row is inside the window drag region');
  await page.keyboard.press('Escape');

  // And the settings panel still opens.
  await page.locator('#settings-button').click();
  await page.waitForSelector('#settings:not([hidden])');
  assert.equal(await page.locator('#settings-button').evaluate(el=>el.classList.contains('active')),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: settings button and find bar sit inside the toolbar drag region with no-drag holes; dropdown clears the toolbar; settings panel opens');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
