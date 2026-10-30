const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+path.resolve('artifacts','test-profile-'+Date.now())],env});
try{
 const page=await app.firstWindow();
 await page.waitForSelector('.tab');
 await page.locator('#settings-button').click();
 assert.equal(await page.locator('#settings').isVisible(),true);
 await page.locator('[data-section="appearance"]').click();
 await page.locator('#opacity').fill('65');
 assert.equal(await page.locator('#opacity-value').textContent(),'65%');
 await page.locator('#reset').click();
 await page.locator('#close-settings').click();
 await page.screenshot({path:'artifacts/home.png'});
 await page.locator('#new').click();
 assert.equal(await page.locator('.tab').count(),2);
 await page.locator('#address').fill('https://example.com');
 await page.locator('#address').press('Enter');
 await page.waitForFunction(()=>document.querySelector('.tab.active .tab-title').textContent.includes('Example Domain'),{timeout:30000});
 const result=await app.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>w.getURL().startsWith('https://example.com')).map(w=>({url:w.getURL(),prefs:w.getLastWebPreferences()})));
 assert.equal(result.length,1);assert.equal(result[0].prefs.nodeIntegration,false);assert.equal(result[0].prefs.sandbox,true);
 await page.locator('#bookmark').click();
 await page.locator('#home').click();
 await page.locator('#favorites-button').click();
 assert.match(await page.locator('#favorites-list').textContent(),/Example Domain/);
 await page.locator('#close-favorites').click();
 await page.locator('#address').fill('https://nocturne-test.invalid');await page.locator('#address').press('Enter');
 await page.waitForSelector('#error-page:not([hidden])');
 await page.screenshot({path:'artifacts/error.png'});
 console.log('PASS: glass controls, tabs, real navigation, sandbox, bookmarks, network errors');
}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
