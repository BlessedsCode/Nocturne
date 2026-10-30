// Exercise the actual registered preload, early inline player data and real
// fetch/XHR in an isolated HTTPS fixture. Trust only this generated certificate
// in this test session; no Windows/user certificate store is changed.
const {_electron:electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
(async()=>{
 const root=path.resolve('artifacts','youtube-content-'+Date.now()),profile=path.join(root,'profile');await fs.mkdir(root,{recursive:true});
 await promisify(execFile)(process.env.OPENSSL||'C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(root,'key.pem'),'-out',path.join(root,'cert.pem'),'-days','1','-subj','/CN=www.youtube.com','-addext','subjectAltName=DNS:www.youtube.com'],{windowsHide:true});
 const cert=await fs.readFile(path.join(root,'cert.pem'),'utf8'),key=await fs.readFile(path.join(root,'key.pem'),'utf8');

 const server=https.createServer({cert,key},(req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Content rules fixture</title><ytd-video-renderer id="ai"><a id="video-title" href="/watch?v=aaaaaaaaaaa">AI-generated film</a><ytd-channel-name><a>Artist</a></ytd-channel-name></ytd-video-renderer><ytd-video-renderer id="normal"><a id="video-title" href="/watch?v=bbbbbbbbbbb">How AI works</a></ytd-video-renderer><ytd-video-renderer id="bait"><a id="video-title" href="/watch?v=ccccccccccc">You won\'t believe this</a></ytd-video-renderer>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='https://www.youtube.com:'+server.address().port+'/',env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile,'--host-resolver-rules=MAP www.youtube.com 127.0.0.1','--no-proxy-server'],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(()=>closePanels(false));
  await app.evaluate(({session},cert)=>{const expected=cert.replace(/\s/g,'');session.fromPartition('persist:nocturne').setCertificateVerifyProc((request,callback)=>callback(request.hostname==='www.youtube.com'&&request.certificate.data.replace(/\s/g,'')===expected?0:-3));},cert);
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  await command('settings-update',{trackerProtection:false,sponsorBlock:false,adBlock:false,ytContentEnabled:true,ytContentAI:'skip',ytContentClickbait:'mark'});
  await command('navigate',url);await page.waitForFunction(()=>state.tabs.some(t=>t.title==='Content rules fixture'&&!t.loading));
  const id=await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url).id,url);
  const native=code=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code),{id,code});
  async function until(code){for(let i=0;i<50;i++){if(await native(code))return;await page.waitForTimeout(100);}throw Error(code);}
  await until('getComputedStyle(document.getElementById("ai")).display==="none"');
  assert.notEqual(await native('getComputedStyle(document.getElementById("normal")).display'),'none');
  await until('!!document.querySelector("#bait [data-nocturne-content]")');
  await command('settings-update',{ytContentEnabled:false});await until('getComputedStyle(document.getElementById("ai")).display!=="none"&&!document.querySelector("[data-nocturne-content]")');
  await command('settings-update',{ytContentEnabled:true,ytContentAI:'mark',ytContentWords:'How AI'});await until('getComputedStyle(document.getElementById("normal")).display==="none"');
  await until('!!document.querySelector("#ai [data-nocturne-content]")');
  await native('document.querySelector("#ai a").textContent="Ordinary film";true');await until('!document.querySelector("#ai [data-nocturne-content]")');

  await command('settings-update',{ytContentAI:'skip',ytContentWords:''});
  await native('history.pushState({},"","/shorts/aaaaaaaaaaa");const reel=document.createElement("ytd-reel-video-renderer");reel.setAttribute("is-active","");reel.innerHTML="<h2>AI-generated film</h2>";document.body.append(reel);const nav=document.createElement("div");nav.id="navigation-button-down";nav.innerHTML="<button>Next</button>";nav.querySelector("button").onclick=()=>window.nextCount=(window.nextCount||0)+1;document.body.append(nav);true');
  await until('window.nextCount===1');
  for(let i=1;i<=5;i++){await native('history.pushState({},"","/shorts/test'+i+'");document.querySelector("ytd-reel-video-renderer h2").textContent="AI-generated film '+i+'";true');await page.waitForTimeout(650);}
  assert.equal(await native('window.nextCount'),5,'Bound automatic Shorts skips');
  await command('settings-update',{ytContentEnabled:false});await native('history.pushState({},"","/shorts/stopped");document.querySelector("h2").textContent="AI-generated stopped";true');await page.waitForTimeout(650);assert.equal(await native('window.nextCount'),5);
  await page.evaluate(()=>{panel('settings');selectSettingsSection('security');});
  await page.locator('[data-browser-setting="ytContentAI"]').selectOption('skip');
  assert.equal((await command('settings-get')).ytContentAI,'skip');
  await page.screenshot({path:path.join(root,'settings.png')});
  assert.equal(await native('typeof require'),'undefined');
  console.log('PASS real registered preload: hiding, marking, disable restores, live rules, recycled cards, settings persistence, sandbox. '+root);
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
