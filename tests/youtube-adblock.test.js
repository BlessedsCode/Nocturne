const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {installYouTubeFilter,YOUTUBE_AD_CSS}=require('../src/preload/youtube-adblock');
function fixture(host='www.youtube.com'){
 const document=new EventTarget(),requests=[];
 document.getElementById=()=>null;
 class XHR{open(method,url){this.url=url;}get responseText(){return this.text;}get response(){return this.responseType==='json'?this.object:this.text;}}
 const context=vm.createContext({document,CustomEvent,URL,Response,Request,Event,MutationObserver:class{},setTimeout:()=>1,clearTimeout(){},XMLHttpRequest:XHR,location:{protocol:'https:',hostname:host,href:'https://'+host+'/watch?v=aaaaaaaaaaa',origin:'https://'+host},fetch:async(url)=>{requests.push(url);const response=new Response(JSON.stringify({adPlacements:[{ad:1}],adSlots:[{}],streamingData:{url:'video'},videoDetails:{videoId:'aaaaaaaaaaa'},captions:{tracks:[1]}}));Object.defineProperty(response,'url',{value:String(url)});return response;}});
 vm.runInContext('globalThis.window=globalThis;globalThis.originalParse=JSON.parse;globalThis.originalFetch=fetch;globalThis.originalOpen=XMLHttpRequest.prototype.open;',context);
 vm.runInContext('('+installYouTubeFilter.toString()+')("test-policy",true)',context);
 return {context,requests,run:code=>vm.runInContext(code,context),toggle:on=>document.dispatchEvent(new CustomEvent('test-policy',{detail:on}))};
}
test('YouTube player metadata is removed at document start without damaging media, captions or playability',()=>{
 const f=fixture();
 const result=f.run('(()=>{window.ytInitialPlayerResponse={playerAds:[{}],adPlacements:[{}],adSlots:[{}],streamingData:{url:"video"},captions:{tracks:[1]},videoDetails:{videoId:"x"},playabilityStatus:{status:"OK"}};return JSON.stringify(ytInitialPlayerResponse);})()');
 assert.deepEqual(JSON.parse(result),{streamingData:{url:'video'},captions:{tracks:[1]},videoDetails:{videoId:'x'},playabilityStatus:{status:'OK'}});
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
 assert.equal(f.run('(()=>{const x=new XMLHttpRequest();x.open("GET","/youtubei/v1/player");x.readyState=4;x.responseURL=location.origin+"/youtubei/v1/player";x.responseType="json";x.object={playerAds:[1],captions:{}};return x.response.playerAds;})()'),undefined);
 f.run('window.siteParse=function siteParse(){};JSON.parse=siteParse;');f.toggle(false);assert(f.run('JSON.parse===siteParse'));
});
test('YouTube code does not attach to lookalike hosts; cosmetic rules target explicit ad containers',()=>{
 const f=fixture('youtube.com.example.org');assert(f.run('JSON.parse===originalParse&&fetch===originalFetch'));
 assert(YOUTUBE_AD_CSS.includes('ytd-ad-slot-renderer'));assert(!YOUTUBE_AD_CSS.includes('ytd-video-renderer {'));
});
