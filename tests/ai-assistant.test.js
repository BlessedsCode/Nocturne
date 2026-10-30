const {test}=require('node:test'),assert=require('node:assert/strict');
const {AIAssistant}=require('../src/main/ai-assistant');
function assistant(fetch){const a=new AIAssistant({directory:'.',crypto:{},fetch});a.key='test-secret';return a;}
test('AI rejects invalid contexts before any network request',async()=>{const a=assistant(()=>{throw Error('must not fetch');});await assert.rejects(a.ask([{role:'system',text:'x'}]),/длинное/);await assert.rejects(a.ask([{role:'user',text:'x'.repeat(12001)}]),/длинное/);assert.equal(JSON.stringify(a.status()).includes('test-secret'),false);});
test('AI quota errors do not leak keys and free the pending request',async()=>{const a=assistant(async()=>new Response('secret response',{status:429}));await assert.rejects(a.ask([{role:'user',text:'hello'}]),/Лимит/);assert.equal(a.pending,null);});
test('AI cancels in-flight requests and rejects concurrent prompts',async()=>{const a=assistant((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));const pending=a.ask([{role:'user',text:'hello'}]);await assert.rejects(a.ask([{role:'user',text:'again'}]),/Дождись/);a.cancel();await assert.rejects(pending,/остановлен/);assert.equal(a.pending,null);});

test('Google AQ keys with dots and legacy keys save and reload without exposing secrets',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nocturne-ai-key-'));
 const crypto={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async text=>Buffer.from(text),decryptStringAsync:async bytes=>({result:bytes.toString()})};
 try{for(const key of ['AQ.synthetic_key_for_regression_123456','AIzaSynthetic_key_for_regression_123456']){
  const a=new AIAssistant({directory,crypto,fetch:()=>{throw Error('No network while saving');}});assert.equal((await a.setKey(key)).configured,true);
  const b=new AIAssistant({directory,crypto});await b.initialize();assert.equal(b.key,key);assert.equal(JSON.stringify(b.status()).includes(key),false);
 }await assert.rejects(new AIAssistant({directory,crypto}).setKey('AQ.bad\r\ninjected-header-123456'),/Проверь/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('free AI uses browser search context without paid Google grounding',async()=>{
 let request;const a=assistant(async(url,options)=>{request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Found [1]'}]}}]}));});
 a.search=async()=>[{number:1,title:'Official',url:'https://example.com',snippet:'Verified snippet'}];const result=await a.ask([{role:'user',text:'Find official site'}]);
 assert(request.url.includes('gemini-3.1-flash-lite'));assert.equal(request.body.tools,undefined);assert(request.body.systemInstruction.parts[0].text.includes('Verified snippet'));assert.equal(result.searched,true);assert.equal(result.sources[0].url,'https://example.com');
});
