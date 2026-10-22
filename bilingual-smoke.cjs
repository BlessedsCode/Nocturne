const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+path.resolve('artifacts','bilingual-test-'+Date.now())],env});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.tab');
 await app.evaluate(async({session,net})=>{
  const original=net.fetch.bind(net);global.__translationCalls=0;global.__searchQueries=[];global.__captchaResolved=false;
  net.fetch=async(url,options)=>{if(String(url).startsWith('https://api.mymemory.translated.net/get?')){global.__translationCalls++;if(global.__translationFailure)return new Response('{}',{status:429});return new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'how to install Huawei laptop touchpad drivers'}}));}return original(url,options);};
  await session.fromPartition('persist:nocturne').protocol.handle('https',request=>{
   const u=new URL(request.url),host=u.hostname,q=u.searchParams.get('q')||u.searchParams.get('text')||u.searchParams.get('p')||'';if(q)global.__searchQueries.push(q);
   const en=!/[а-яё]/i.test(q),href='https://fixture.example/'+(en?'en':'ru'),title=en?'Huawei touchpad driver installation (EN)':'Установка драйвера тачпада Huawei';
   let html;
   if(host.includes('google'))html=global.__captchaResolved?'<div id="search"><a href="'+href+'"><h3>'+title+'</h3></a></div>':'<p>Confirm you’re not a robot. Unusual traffic</p>';
   else if(host.includes('bing'))html='<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1'+Buffer.from(href).toString('base64url')+'">'+title+'</a></h2><div class="b_caption"><p>Touchpad drivers for Huawei laptop</p></div></li>';
   else if(host.includes('yahoo'))html='<div id="web"><a data-matarget="algo" href="'+href+'"><h3>'+title+'</h3></a></div>';
   else if(host.includes('duckduckgo'))html='<a class="result__a" href="'+href+'">'+title+'</a>';
   else if(host.includes('yandex'))html='<a class="OrganicTitle-Link" href="'+href+'">'+title+'</a>';
   else if(host.includes('brave'))html='<div class="snippet"><a class="heading-serpresult" href="'+href+'">'+title+'</a></div>';
   else html='<a class="result-title" href="'+href+'">'+title+'</a>';
   return new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}});
  });
 });
 const waitDone=()=>page.waitForFunction(()=>document.getElementById('combined-status').textContent.startsWith('Найдено'));
 await page.evaluate(()=>openCombinedSearch('как поставить драйвера на тачпад хуавей'));await waitDone();
 assert.match(await page.locator('#combined-english-query').inputValue(),/how to install Huawei/);assert.equal(await page.locator('.combined-result').count(),2);
 assert.match(await page.locator('.combined-sources').first().textContent(),/EN/);
 assert.match(await page.locator('.combined-filters').textContent(),/Bing · 2/);assert.match(await page.locator('.combined-filters').textContent(),/Yahoo · 2/);
 let count=await app.evaluate(()=>global.__searchQueries.length);await page.locator('.combined-header button[type=submit]').click();await waitDone();assert.equal(await app.evaluate(()=>global.__searchQueries.length),count);
 await page.locator('#combined-retry').click();await waitDone();assert((await app.evaluate(()=>global.__searchQueries.length))>count);assert.equal(await app.evaluate(()=>global.__translationCalls),1);
 await page.locator('#combined-english-query').fill('Huawei trackpad install Windows');await page.locator('#combined-retry').click();await waitDone();assert((await app.evaluate(()=>global.__searchQueries)).includes('Huawei trackpad install Windows'));
 await page.locator('#combined-english').uncheck();count=await app.evaluate(()=>global.__searchQueries.length);await page.locator('#combined-retry').click();await waitDone();const batch=await app.evaluate((_electron,count)=>global.__searchQueries.slice(count),count);assert(batch.length===7&&batch.every(q=>/[а-яё]/i.test(q)),JSON.stringify({batch,checked:await page.locator('#combined-english').isChecked()}));
 // Actual child window, ordinary sandboxed provider page, then automatic uncached refresh.
 await page.getByRole('button',{name:/Google · капча/}).click();await page.getByRole('button',{name:'Открыть проверку',exact:true}).click();
 await page.waitForFunction(()=>true);await app.evaluate(async({BrowserWindow})=>{const windows=BrowserWindow.getAllWindows();if(windows.length!==2)throw new Error('Verification window not created');const child=windows.find(window=>!!window.getParentWindow());if(!child.webContents.getLastWebPreferences().sandbox)throw new Error('Missing sandbox');global.__captchaResolved=true;child.close();});
 await page.waitForFunction(()=>document.querySelector('.combined-filters').textContent.includes('Google · 1'));
 await app.evaluate(()=>global.__translationFailure=true);await page.locator('#combined-english').check();await page.locator('#combined-query').fill('другой запрос для перевода');await page.locator('.combined-header button[type=submit]').click();await waitDone();assert.match(await page.locator('#combined-translation-status').textContent(),/недоступен/);assert((await page.locator('.combined-result').count())>0);
 assert.deepEqual(errors,[]);console.log('PASS: modern Yahoo markup; Bing encoded redirects; original + translated query; EN badges; deduplication; query cache and force retry; translation cache; manual English; opt out; sandboxed verification + automatic refresh; failed translation keeps original results');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
