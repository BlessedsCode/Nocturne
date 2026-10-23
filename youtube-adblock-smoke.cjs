// Exercise the actual registered preload, early inline player data and real
// fetch/XHR in an isolated HTTPS fixture. Trust only this generated certificate
// in this test session; no Windows/user certificate store is changed.
const {_electron:electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
(async()=>{
 const root=path.resolve('artifacts','youtube-filter-'+Date.now()),profile=path.join(root,'profile');await fs.mkdir(root,{recursive:true});
 await promisify(execFile)(process.env.OPENSSL||'C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(root,'key.pem'),'-out',path.join(root,'cert.pem'),'-days','1','-subj','/CN=www.youtube.com','-addext','subjectAltName=DNS:www.youtube.com'],{windowsHide:true});
 const cert=await fs.readFile(path.join(root,'cert.pem'),'utf8'),key=await fs.readFile(path.join(root,'key.pem'),'utf8');
 const payload={adPlacements:[{ad:1}],playerAds:[{}],adSlots:[{}],streamingData:{formats:[{url:'https://video.example/content'}]},captions:{tracks:[1]},videoDetails:{videoId:'aaaaaaaaaaa'},playabilityStatus:{status:'OK'}};
 const server=https.createServer({cert,key},(req,res)=>{
  if(req.url.startsWith('/youtubei/v1/player')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(payload));}
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>YouTube filter fixture</title><script>window.ytInitialPlayerResponse='+JSON.stringify(payload)+';window.initialHadAd=!!ytInitialPlayerResponse.adPlacements;window.initialMedia=ytInitialPlayerResponse.streamingData.formats[0].url;</script><div id="movie_player"><video></video><button class="ytp-skip-ad-button" onclick="window.skipClicks=(window.skipClicks||0)+1;document.getElementById(\'movie_player\').classList.remove(\'ad-showing\')">Skip ad</button></div><ytd-ad-slot-renderer id="ad">Advertisement</ytd-ad-slot-renderer><ytd-video-renderer id="organic">Normal recommendation</ytd-video-renderer>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='https://www.youtube.com:'+server.address().port+'/watch?v=aaaaaaaaaaa',env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await require('./test-profile.cjs').launch(electron,{args:[path.resolve('.'),'--user-data-dir='+profile,'--host-resolver-rules=MAP www.youtube.com 127.0.0.1','--no-proxy-server'],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.tab');await page.evaluate(()=>closePanels(false));
  await app.evaluate(({session},cert)=>{const expected=cert.replace(/\s/g,'');session.fromPartition('persist:nocturne').setCertificateVerifyProc((request,callback)=>callback(request.hostname==='www.youtube.com'&&request.certificate.data.replace(/\s/g,'')===expected?0:-3));},cert);
  const command=(name,value)=>page.evaluate(({name,value})=>window.browser.command(name,value),{name,value});
  await command('settings-update',{trackerProtection:false,sponsorBlock:false});
  async function load(){await command('navigate',url);await page.waitForFunction(()=>state.tabs.some(t=>t.title==='YouTube filter fixture'&&!t.loading));}
  await load();
  const id=await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL()===url).id,url);
  const native=code=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code),{id,code});
  async function until(code,expected=true){for(let i=0;i<40;i++){if(await native(code)===expected)return;await page.waitForTimeout(100);}throw Error('Condition failed: '+code);}
  assert.equal(await native('window.initialHadAd'),false,'Ad metadata must be removed BEFORE inline scripts consume it');
  assert.equal(await native('window.initialMedia'),'https://video.example/content');
  await until('getComputedStyle(document.querySelector("#ad")).display==="none"');
  assert.notEqual(await native('getComputedStyle(document.querySelector("#organic")).display'),'none');
  const fetchInfo=await native('(async()=>{const r=await fetch("/youtubei/v1/player?fetch");const copy=r.clone();return {status:r.status,response:r instanceof Response,data:await r.json(),text:await copy.text()};})()');
  assert.equal(fetchInfo.status,200);assert(fetchInfo.response);assert(!fetchInfo.data.adPlacements);assert(fetchInfo.data.streamingData);assert(!JSON.parse(fetchInfo.text).adSlots);
  const xhrInfo=await native('new Promise(resolve=>{const x=new XMLHttpRequest();x.open("GET","/youtubei/v1/player?xhr");x.responseType="json";x.onload=()=>resolve(x.response);x.send();})');assert(!xhrInfo.playerAds);assert(xhrInfo.captions);
  const xhrText=await native('new Promise(resolve=>{const x=new XMLHttpRequest();x.open("GET","/youtubei/v1/player?text");x.onload=()=>resolve(x.responseText);x.send();})');assert(!JSON.parse(xhrText).adSlots);
  await native('document.querySelector("#movie_player").classList.add("ad-showing");true');await until('(window.skipClicks||0)===1');
  await page.waitForTimeout(300);assert.equal(await native('window.skipClicks'),1,'Never click skip controls on ordinary content');
  await command('settings-update',{adBlock:false});await until('getComputedStyle(document.querySelector("#ad")).display!=="none"');
  assert(await native('(async()=>!!(await(await fetch("/youtubei/v1/player?disabled")).json()).adSlots)()'));
  await load();assert.equal(await native('window.initialHadAd'),true,'Disabled before navigation must preserve initial metadata');
  await command('settings-update',{adBlock:true});await load();assert.equal(await native('window.initialHadAd'),false);
  await command('security-exception',{host:'www.youtube.com'});await load();assert.equal(await native('window.initialHadAd'),true,'Site exceptions must apply at document start');
  await command('security-exception',{host:'www.youtube.com',remove:true});await load();assert.equal(await native('window.initialHadAd'),false);
  await native('history.pushState({},"","/watch?v=bbbbbbbbbbb");document.dispatchEvent(new Event("yt-navigate-finish"));window.playerResponse={adSlots:[{}],videoDetails:{videoId:"bbbbbbbbbbb"}};true');
  assert.equal(await native('window.playerResponse.adSlots'),undefined);assert.equal(await native('window.playerResponse.videoDetails.videoId'),'bbbbbbbbbbb');
  assert.equal(await native('typeof window.browser+":"+typeof require'),'undefined:undefined');
  const result={pass:true,registeredPreload:true,documentStart:true,fetchAndClone:true,xhrJSONAndText:true,adCards:true,organicContentPreserved:true,nativeSkipOnly:true,disableEnable:true,siteExceptions:true,spaNavigation:true,nodeIsolation:true};
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));console.log('PASS '+JSON.stringify(result)+' '+root);
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
