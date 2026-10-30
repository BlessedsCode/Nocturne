const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const profile=path.resolve('artifacts','last-tab-profile-'+Date.now());
function waitExit(proc,ms){
 return new Promise(resolve=>{
  if(proc.exitCode!==null)return resolve(true);
  const timer=setTimeout(()=>resolve(false),ms);
  proc.once('exit',()=>{clearTimeout(timer);resolve(true);});
 });
}
(async()=>{
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile],env});
 let exited=false;
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.tab');
  const windowCount=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length);
  assert.equal(await windowCount(),1);

  // Two tabs: closing one keeps the window alive.
  await page.evaluate(()=>window.browser.command('new'));
  await page.waitForFunction(()=>document.querySelectorAll('.tab').length===2);
  await page.evaluate(()=>window.browser.command('close-tab',state.active));
  await page.waitForFunction(()=>document.querySelectorAll('.tab').length===1);
  await page.waitForTimeout(400);
  assert.equal(await windowCount(),1,'closing one of two tabs must keep the window open');

  // Last tab: the window closes and the app quits, like a normal browser.
  page.evaluate(()=>window.browser.command('close-tab',state.active)).catch(()=>{});
  exited=await waitExit(app.process(),15000);
  assert.equal(exited,true,'closing the last tab must close the browser');
  assert.deepEqual(errors,[]);
  console.log('PASS: closing one of two tabs keeps the window; closing the last tab closes the window and quits');
 }finally{
  if(!exited)await app.close().catch(()=>{});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
