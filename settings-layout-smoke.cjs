const {_electron:electron}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
(async()=>{const root=path.resolve('artifacts','settings-layout-'+Date.now());await fs.mkdir(root,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+path.join(root,'profile')],env});
 try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.tab');
  for(const [width,height]of [[800,650],[1024,768],[1334,900],[1920,1080]]){
   await app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(640,480);w.setContentSize(width,height);},{width,height});
   await page.evaluate(()=>{document.activeElement?.blur();closePanels(false);panel('settings');selectSettingsSection('appearance');});await page.waitForTimeout(300);
   const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};};return {close:rect('#close-settings'),panel:rect('#settings'),scroll:rect('.settings-scroll'),select:rect('#interface-color'),range:rect('#opacity'),presets:rect('#appearance-section .presets'),toggle:rect('#appearance-section>.toggle'),overflow:document.querySelector('.settings-scroll').scrollWidth>document.querySelector('.settings-scroll').clientWidth+1};});
   assert(geometry.close.right<=geometry.panel.right-4,'Close button clipped at '+width);assert(geometry.close.left>=geometry.scroll.left);assert(!geometry.overflow,'Horizontal overflow at '+width);
   for(const key of ['range','presets','toggle'])assert(Math.abs(geometry[key].right-geometry.select.right)<2,'Misaligned '+key+' at '+width);
   await page.screenshot({path:path.join(root,'appearance-'+width+'.png')});
   await page.locator('#opacity').focus();const before=await page.locator('#opacity').inputValue();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#opacity').inputValue(),before);
   await page.locator('#close-settings').click();await page.locator('#settings').waitFor({state:'hidden'});
   await page.evaluate(()=>{panel('settings');selectSettingsSection('security');});await page.locator('[data-browser-setting="ytContentWords"]').fill('test\nsecond');await page.locator('[data-browser-setting="ytContentWords"]').blur();
   assert.equal(await page.locator('[data-browser-setting="ytContentWords"]').evaluate(el=>getComputedStyle(el).fontFamily.includes('Segoe')),true);
  }
  assert.deepEqual(errors,[]);console.log('PASS settings at 800/1024/1334/1920: aligned controls, no overflow, visible close, keyboard sliders, styled textareas. '+root);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
