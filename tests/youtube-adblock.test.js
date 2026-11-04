const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {installYouTubeFilter,YOUTUBE_AD_CSS}=require('../src/preload/youtube-adblock');
function fixture(host='www.youtube.com',player=null,scheduler=null){
 const document=new EventTarget(),requests=[];
 document.getElementById=()=>player;
 class XHR{open(method,url){this.url=url;}get responseText(){return this.text;}get response(){return this.responseType==='json'?this.object:this.text;}}
 const context=vm.createContext({document,CustomEvent,URL,Response,Request,Event,ytcfg:{data_:{INNERTUBE_CONTEXT:{client:{userAgent:'Mozilla/5.0 (Test OS) Chrome/156',clientName:'WEB'}}}},MutationObserver:class{observe(){}disconnect(){}},setTimeout:scheduler?.setTimeout||(()=>1),clearTimeout:scheduler?.clearTimeout||(()=>{}),XMLHttpRequest:XHR,location:{protocol:'https:',hostname:host,href:'https://'+host+'/watch?v=aaaaaaaaaaa',origin:'https://'+host},fetch:async(url)=>{requests.push(url);const response=new Response(JSON.stringify({adPlacements:[{ad:1}],adSlots:[{}],streamingData:{url:'video'},videoDetails:{videoId:'aaaaaaaaaaa'},captions:{tracks:[1]}}));Object.defineProperty(response,'url',{value:String(url)});return response;}});
 vm.runInContext('globalThis.window=globalThis;globalThis.originalParse=JSON.parse;globalThis.originalFetch=fetch;globalThis.originalOpen=XMLHttpRequest.prototype.open;',context);
 vm.runInContext('('+installYouTubeFilter.toString()+')("test-policy",true)',context);
 return {context,requests,run:code=>vm.runInContext(code,context),toggle:on=>document.dispatchEvent(new CustomEvent('test-policy',{detail:on}))};
}
test('YouTube player metadata is removed at document start without damaging media, captions or playability',()=>{
 const f=fixture();
 const result=f.run('(()=>{window.ytInitialPlayerResponse={playerAds:[{}],adPlacements:[{}],adSlots:[{}],streamingData:{url:"video"},captions:{tracks:[1]},videoDetails:{videoId:"x"},playabilityStatus:{status:"OK"}};return JSON.stringify(ytInitialPlayerResponse);})()');
 assert.deepEqual(JSON.parse(result),{playerAds:[{}],streamingData:{url:'video'},captions:{tracks:[1]},videoDetails:{videoId:'x'},playabilityStatus:{status:'OK'}});
 assert.equal(f.run('JSON.parse("{\\"nested\\":{\\"adSlots\\":[1]},\\"content\\":\\"keep\\"}").nested.adSlots'),undefined);
 assert.equal(f.run('JSON.parse("{\\"value\\":1}",(k,v)=>k==="value"?2:v).value'),2);
 assert.throws(()=>f.run('JSON.parse("invalid")'));
});
test('YouTube fetch preserves Response behavior, clones and ordinary requests',async()=>{
 const f=fixture();
 const result=JSON.parse(await f.run('(async()=>{const r=await fetch("https://www.youtube.com/youtubei/v1/player?key=test");const copy=r.clone();return JSON.stringify({ok:r.ok,status:r.status,isResponse:r instanceof Response,value:await r.json(),text:await copy.text()});})()'));
 assert(result.ok&&result.isResponse);assert.equal(result.status,200);assert(!('adSlots'in result.value));assert(result.value.captions);assert(!JSON.parse(result.text).adPlacements);
 assert(await f.run('(async()=>{const r=await fetch("https://www.youtube.com/api/ordinary");return !!(await r.json()).adSlots;})()'));
 assert(await f.run('(async()=>{const r=await fetch("https://example.org/youtubei/v1/player");return !!(await r.json()).adSlots;})()'));
 f.toggle(false);assert(f.run('fetch===originalFetch&&JSON.parse===originalParse&&XMLHttpRequest.prototype.open===originalOpen'));
 assert(await f.run('(async()=>{const r=await fetch("https://www.youtube.com/youtubei/v1/player");return !!(await r.json()).adSlots;})()'));
 f.toggle(true);assert(!await f.run('(async()=>{const r=await fetch("https://www.youtube.com/youtubei/v1/player");return !!(await r.json()).adSlots;})()'));
});
test('YouTube XHR supports text/JSON and disabling does not overwrite later site hooks',()=>{
 const f=fixture();
 assert.equal(f.run('(()=>{const x=new XMLHttpRequest();x.open("GET","/youtubei/v1/player");x.readyState=4;x.responseURL=location.origin+"/youtubei/v1/player";x.text="{\\"adSlots\\":[1],\\"streamingData\\":{}}";return JSON.parse(x.responseText).adSlots;})()'),undefined);
 assert.equal(f.run('(()=>{const x=new XMLHttpRequest();x.open("GET","/youtubei/v1/player");x.readyState=4;x.responseURL=location.origin+"/youtubei/v1/player";x.responseType="json";x.object={adSlots:[1],captions:{}};return x.response.adSlots;})()'),undefined);
 f.run('window.siteParse=function siteParse(){};JSON.parse=siteParse;');f.toggle(false);assert(f.run('JSON.parse===siteParse'));
});
test('YouTube code does not attach to lookalike hosts; cosmetic rules target explicit ad containers',()=>{
 const f=fixture('youtube.com.example.org');assert(f.run('JSON.parse===originalParse&&fetch===originalFetch'));
 assert(YOUTUBE_AD_CSS.includes('ytd-ad-slot-renderer'));assert(!YOUTUBE_AD_CSS.includes('ytd-video-renderer {'));
});
test('current player fixes include prefetched and playlist responses without inventing playability',async()=>{
 const f=fixture();
 for(const endpoint of ['/youtubei/v1/navigation/resolve_url','/playlist?list=test','/watch?v=aaaaaaaaaaa'])assert(!await f.run('(async()=>!!(await(await fetch('+JSON.stringify('https://www.youtube.com'+endpoint)+')).json()).adSlots)()'));
 const data=JSON.parse(f.run('JSON.stringify(JSON.parse(\'{"adSlots":[1],"playerAds":[1],"adBreakHeartbeatParams":{"keep":true},"playabilityStatus":{"status":"UNPLAYABLE","reason":"Ad blocker restriction"}}\'))'));
 assert.deepEqual(data.playerAds,[1]);assert.deepEqual(data.adBreakHeartbeatParams,{keep:true});assert.equal(data.playabilityStatus.status,'UNPLAYABLE');assert.equal(data.playabilityStatus.reason,'Ad blocker restriction');
});
test('YouTube container compatibility keeps the player container visible and other cosmetic rules intact',()=>{
 const {compatibleYouTubeCSS}=require('../src/main/adblock');
 assert.equal(compatibleYouTubeCSS('#player-ads{display:none!important}.other{color:red}'),'.other{color:red}');
 assert.equal(compatibleYouTubeCSS('#player-ads, .advert{display:none!important}'), ' .advert{display:none!important}');
 assert(!YOUTUBE_AD_CSS.includes('#player-ads'));
});
test('ad-block recovery is bounded to the current video and alternate playback requests; authentication failures are preserved',()=>{
 function player(reason,id='aaaaaaaaaaa'){return {calls:[],classList:{contains:()=>false},querySelector:()=>null,getPlayerResponse:()=>({videoDetails:{videoId:id},playabilityStatus:{status:'UNPLAYABLE',reason}}),getCurrentTime:()=>42,loadVideoById(value){this.calls.push(value);}};}
 const p=player('Ad blockers violate YouTube terms');const f=fixture('www.youtube.com',p);assert.equal(p.calls.length,1);assert.equal(p.calls[0].videoId,'aaaaaaaaaaa');assert.equal(p.calls[0].startSeconds,42);
 f.run('document.dispatchEvent(new Event("yt-navigate-finish"));');assert.equal(p.calls.length,1,'Never loop recovery for the same video');
 const request=JSON.parse(f.run('(()=>{const body={attestationRequest:{token:"untouched"},context:{client:{clientName:"WEB",clientScreen:"WATCH"}},videoId:"aaaaaaaaaaa"};const encoded=JSON.stringify(body);return originalParse(JSON.stringify({encoded,original:body.context.client.clientScreen}));})()').encoded);
 assert.equal(request.context.client.clientScreen,'CHANNEL');assert.equal(request.attestationRequest.token,'untouched');
 assert(f.run('ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent.includes("; channel")'));
 assert.equal(f.run('JSON.stringify({createCommentParams:"fixture",context:{client:ytcfg.data_.INNERTUBE_CONTEXT.client}})').includes('; channel'),false);
 assert.equal(f.run('JSON.stringify({context:{client:{clientName:"WEB",clientScreen:"WATCH"}}})').includes('CHANNEL'),false);
 for(const reason of ['Sign in to confirm not a bot','Ad blocker: sign in required','Age restricted','Private video','Блокировщик рекламы: подтвердите возраст']){const other=player(reason);fixture('www.youtube.com',other);assert.equal(other.calls.length,0,reason);}
 const stale=player('Ad blockers', 'bbbbbbbbbbb');fixture('www.youtube.com',stale);assert.equal(stale.calls.length,0);
 f.toggle(false);assert.equal(f.run('JSON.stringify({attestationRequest:{},context:{client:{clientName:"WEB",clientScreen:"WATCH"}}})').includes('CHANNEL'),false);assert.equal(f.run('ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent'),'Mozilla/5.0 (Test OS) Chrome/156');
});
test('ERROR ad-block restrictions recover while ordinary ERROR failures remain intact',()=>{
 for(const [reason,expected] of [['Ad blockers violate YouTube terms',1],['Блокировщики рекламы нарушают Условия использования YouTube',1],['Video unavailable',0],['Network error',0],['Ad blocker: sign in required',0]]){
  const p={classList:{contains:()=>false},querySelector:()=>null,getPlayerResponse:()=>({playabilityStatus:{status:'ERROR',reason}}),calls:[],loadVideoById(v){this.calls.push(v);}};
  fixture('www.youtube.com',p);assert.equal(p.calls.length,expected,reason);
 }
});

test('ERROR with no structured error uses the player restriction text only',()=>{
 const p={innerText:'Блокировщики рекламы нарушают Условия использования YouTube',classList:{contains:()=>false},querySelector:()=>null,getPlayerResponse:()=>({playabilityStatus:{status:'ERROR'}}),calls:[],loadVideoById(v){this.calls.push(v);}};
 const f=fixture('www.youtube.com',p);assert.equal(p.calls.length,1);
 f.toggle(false);p.innerText='Войдите в аккаунт, чтобы подтвердить, что вы не бот';f.toggle(true);assert.equal(p.calls.length,1);
});

test('enforcementMessageViewModel reads display text without interpreting navigation commands',()=>{
 const response={playabilityStatus:{status:'ERROR',errorScreen:{enforcementMessageViewModel:{header:{text:{content:'Блокировщики рекламы нарушают Условия использования YouTube'}},button:{onTap:{signInEndpoint:{text:'Sign in'}}}}}}};
 const p={classList:{contains:()=>false},querySelector:()=>null,getPlayerResponse:()=>response,calls:[],loadVideoById(v){this.calls.push(v);}};
 fixture('www.youtube.com',p);assert.equal(p.calls.length,1);
});

test('alternate playback modes stop after four attempts and cancel on disable or successful playback',()=>{
 const pending=new Map();let counter=0,status='ERROR';
 const scheduler={setTimeout(fn,delay){const id=++counter;pending.set(id,{fn,delay});return id;},clearTimeout(id){pending.delete(id);}};
 const p={classList:{contains:()=>false},querySelector:()=>null,getPlayerResponse:()=>({playabilityStatus:{status,errorScreen:{playerErrorMessageRenderer:{subreason:{runs:[{navigationEndpoint:{url:'https://support.google.com/youtube/answer/3037019'}}]}}}}}),calls:[],loadVideoById(v){this.calls.push(v);}};
 const f=fixture('www.youtube.com',p,scheduler);
 const advance=()=>{const item=[...pending].find(([,v])=>v.delay===2500);if(!item)return false;pending.delete(item[0]);item[1].fn();return true;};
 const request=()=>JSON.parse(f.run('JSON.stringify({videoId:"aaaaaaaaaaa",attestationRequest:{},context:{client:{clientName:"WEB"}},playbackContext:{contentPlaybackContext:{}}})'));
 assert.equal(p.calls.length,1);assert.equal(request().context.client.clientScreen,'CHANNEL');
 assert(advance());assert.equal(request().params,'8AUB');
 assert(advance());assert.equal(request().params,'YAHI');
 assert(advance());assert.equal(request().playbackContext.contentPlaybackContext.isInlinePlaybackNoAd,true);
 assert.equal(advance(),false);assert.equal(p.calls.length,4);
 f.toggle(false);f.toggle(true);status='OK';assert(advance());assert.equal(p.calls.length,5,'Success stops retrying');
 status='ERROR';f.toggle(false);f.toggle(true);f.toggle(false);assert.equal(advance(),false,'Disable cancels scheduled retries');
});

test('stale enforcement overlay is hidden only after matching media actually plays and restored on disable',()=>{
 let status='ERROR';const video={paused:false,readyState:4,currentTime:0};
 const root={style:{cssText:'color:red',setProperty(){this.cssText='display:none!important';}}},message={closest:()=>root};
 const p={classList:{contains:()=>false},querySelector:()=>video,getPlayerResponse:()=>({videoDetails:{videoId:'aaaaaaaaaaa'},playabilityStatus:{status,reason:'Ad blockers violate YouTube terms'}}),loadVideoById(){}};
 const f=fixture('www.youtube.com',p);f.context.document.querySelectorAll=()=>[message];
 status='OK';f.run('document.dispatchEvent(new Event("timeupdate"))');assert.equal(root.style.cssText,'color:red');
 video.currentTime=1;f.run('document.dispatchEvent(new Event("timeupdate"))');assert.equal(root.style.cssText,'display:none!important');
 f.toggle(false);assert.equal(root.style.cssText,'color:red');
});

test('interstitial ad-block messages can omit videoDetails and contain unrelated sign-in navigation',()=>{
 const response={playabilityStatus:{status:'LOGIN_REQUIRED',errorScreen:{playerInterstitialRenderer:{content:{interstitialViewModel:{title:{content:'Блокировщики рекламы нарушают Условия использования YouTube'},description:{content:'Отключите блокировщик рекламы'},button:{signInEndpoint:{next:'private'}}}}}}}};
 const p={classList:{contains:()=>false},querySelector:()=>null,getPlayerResponse:()=>response,calls:[],loadVideoById(v){this.calls.push(v);}};
 const f=fixture('www.youtube.com',p);assert.equal(p.calls.length,1);assert.equal(p.calls[0].videoId,'aaaaaaaaaaa');
 response.playabilityStatus.errorScreen.playerInterstitialRenderer.content.interstitialViewModel.title.content='Войдите в аккаунт, чтобы подтвердить, что вы не бот';response.playabilityStatus.errorScreen.playerInterstitialRenderer.content.interstitialViewModel.description.content='';f.toggle(false);f.toggle(true);assert.equal(p.calls.length,1,'Never retry a real authentication gate');
});
