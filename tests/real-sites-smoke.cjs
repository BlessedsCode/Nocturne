const {_electron:electron}=require('playwright-core'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('artifacts','real-sites-'+Date.now());await fs.mkdir(root,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+path.join(root,'profile')],env}),results=[],errors=[];
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.tab');
 const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
 const sites=[['Wikipedia','https://en.wikipedia.org/wiki/Mont-Saint-Michel'],['MDN','https://developer.mozilla.org/en-US/docs/Web/JavaScript'],['GitHub','https://github.com/BlessedsCode/Nocturne'],['YouTube','https://www.youtube.com/'],['Yandex','https://ya.ru/'],['DuckDuckGo','https://duckduckgo.com/?q=Mont+Saint+Michel']];
 try{for(const [name,url] of sites){const row={name,requested:url};try{
  await page.evaluate(()=>closePanels(false));await page.locator('#address').blur();await command('open-tab',url);await page.waitForFunction(()=>{const t=state.tabs.find(t=>t.id===state.active);return t&&!t.loading&&!!t.url;},null,{timeout:25000});
  const tab=await page.evaluate(()=>state.tabs.find(t=>t.id===state.active));row.tab=tab;
  const id=await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url)?.id,tab.url);assert(id,'No visible site page');
  const inspect=code=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code),{id,code});
  row.document=await inspect('({url:location.href,title:document.title,text:document.body?.innerText.slice(0,500),links:document.links.length,images:document.images.length,ready:document.readyState})');
  assert(!tab.error&&!tab.security,'Browser error or protection screen');assert(row.document.text?.length>30,'Empty document');
  if(/captcha|verify you are human|just a moment|access denied|unusual traffic/i.test(row.document.title+' '+row.document.text)){row.status='site-challenge';console.log('CHALLENGE '+name);results.push(row);continue;}
  await inspect('window.__nocturneRealProbe="retained";scrollTo({top:Math.min(600,document.documentElement.scrollHeight-innerHeight),behavior:"instant"});true');
  const before=await inspect('({y:scrollY,url:location.href})');await page.evaluate(()=>panel('settings'));await page.waitForFunction(()=>document.body.classList.contains('site-overlay-open'));await page.evaluate(()=>closePanels(false));
  assert.equal(await inspect('window.__nocturneRealProbe'),'retained');assert.deepEqual(await inspect('({y:scrollY,url:location.href})'),before);row.overlay='retains page and scroll';
  await command('new');await command('switch',tab.id);assert.equal(await inspect('window.__nocturneRealProbe'),'retained');row.switch='retains document';
  if(['Wikipedia','MDN','GitHub'].includes(name)){
   const token=name==='Wikipedia'?'Mont':name==='MDN'?'JavaScript':'Nocturne';
   row.find=await app.evaluate(async({webContents},{id,token})=>{const wc=webContents.fromId(id);return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{wc.removeListener('found-in-page',done);reject(new Error('Find timeout'));},5000);function done(e,r){if(r.finalUpdate){clearTimeout(timer);wc.removeListener('found-in-page',done);wc.stopFindInPage('clearSelection');resolve(r.matches);}}wc.on('found-in-page',done);wc.findInPage(token);});},{id,token});assert(row.find>0);
  }
  if(name==='Wikipedia'){
   const origin=row.document.url;
   const destination=await app.evaluate(async({webContents},id)=>{const wc=webContents.fromId(id);const target=await wc.executeJavaScript('(()=>{const a=[...document.querySelectorAll("#mw-content-text a[href]")].find(a=>a.href.startsWith(location.origin+"/wiki/")&&!a.href.includes(":",location.origin.length+6)&&a.getClientRects().length&&a.textContent.trim().length>3);if(!a)throw Error("No article link");a.scrollIntoView({behavior:"instant",block:"center"});const r=a.getBoundingClientRect();return {url:a.href,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');wc.sendInputEvent({type:'mouseDown',button:'left',x:target.x,y:target.y,clickCount:1});wc.sendInputEvent({type:'mouseUp',button:'left',x:target.x,y:target.y,clickCount:1});return target.url;},id);
   await page.waitForFunction(origin=>{const t=state.tabs.find(t=>t.id===state.active);return t.url!==origin&&!t.loading;},origin,{timeout:20000});
   row.linkDestination=destination;await command('back');await page.waitForFunction(origin=>{const t=state.tabs.find(t=>t.id===state.active);return t.url===origin&&!t.loading;},origin,{timeout:20000});row.back='returned to original article';
  }
  const image=await app.evaluate(async({webContents},id)=>(await webContents.fromId(id).capturePage()).toPNG().toString('base64'),id);await fs.writeFile(path.join(root,name+'.png'),Buffer.from(image,'base64'));
  row.status='pass';console.log('PASS '+name+' — '+row.document.title);
 }catch(e){row.status='failed';row.error=e.message;console.log('FAIL '+name+' '+e.message.slice(0,180));}results.push(row);await fs.writeFile(path.join(root,'results.json'),JSON.stringify({results,errors},null,2));}
 assert.deepEqual(errors,[]);console.log('Report: '+root);process.exitCode=results.some(r=>r.status==='failed')?1:0;
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
