const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Profile}=require('../src/main/profile');

test('real debounced history writes coalesce visits, and failed flush retains pending data',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nocturne-history-debounce-')),profile=new Profile(directory);let writes=0;const write=profile.write.bind(profile);profile.write=(...args)=>{writes++;return write(...args);};
 try{for(let i=0;i<10;i++)profile.visit('https://example.com/'+i,'Page');assert.equal(writes,0);await new Promise(resolve=>setTimeout(resolve,2700));assert.equal(writes,1);assert.equal(new Profile(directory).history.length,10);
  profile.visit('https://example.com/retry','Retry');profile.write=()=>{throw new Error('simulated disk error');};assert.throws(()=>profile.flush(),/disk error/);assert(profile._historyDirty);profile.write=write;profile.flush();assert.equal(new Profile(directory).history.length,11);
 }finally{clearTimeout(profile._historyTimer);fs.rmSync(directory,{recursive:true,force:true});}
});
test('dismissed frequent sites stay hidden after restart while history and other profiles are preserved',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nocturne-dismiss-'));
 try{const profile=new Profile(directory);profile.visit('https://example.com/a','Example');profile.visit('https://example.com/b','Example B');profile.visit('https://other.example/','Other');profile.dismissSuggestion('https://example.com/a');assert.equal(profile.history.length,3);assert.deepEqual(profile.recommendedHistory().map(entry=>entry.url),['https://other.example/']);profile.flush();const restarted=new Profile(directory);assert.equal(restarted.recommendedHistory().length,1);assert.equal(restarted.history.length,3);const personal=new Profile(path.join(directory,'personal'));personal.visit('https://example.com/','Private');personal.flush();assert.equal(personal.recommendedHistory().length,1);assert.throws(()=>profile.dismissSuggestion('javascript:alert(1)'),/адрес/);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('history deletion removes exact selected visits and survives restart without touching another profile',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nocturne-history-'));
 try{const primary=new Profile(path.join(directory,'main')),personal=new Profile(path.join(directory,'personal'));primary.visit('https://example.com/a','One');primary.visit('https://example.com/b','Two');primary.visit('https://example.com/a','Three');personal.visit('https://personal.example/','Private');const id=primary.history[2].id;personal.flush();assert.equal(primary.deleteHistory([id]),1);assert.equal(primary.history.length,2);assert.equal(primary.history.filter(entry=>entry.url.endsWith('/a')).length,1);assert.equal(new Profile(primary.directory).history.length,2);assert.equal(new Profile(personal.directory).history.length,1);assert.equal(primary.deleteHistory(primary.history.map(entry=>entry.id)),2);assert.equal(personal.history.length,1);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('malformed profile values do not break startup; valid preferences and history survive',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nocturne-profile-'));
 try{
  fs.writeFileSync(path.join(directory,'browser-settings.json'),JSON.stringify({zoom:0,searchEngine:'invalid',media:'allow',notifications:null,cloudProvider:'invalid',trackingExceptions:{},keepHistory:false,doNotTrack:true}));
  fs.writeFileSync(path.join(directory,'history.json'),'null');fs.writeFileSync(path.join(directory,'tabs.json'),'{}');
  let profile=new Profile(directory);assert.equal(profile.preferences.zoom,100);assert.equal(profile.preferences.media,'block');assert.equal(profile.preferences.notifications,'block');assert.equal(profile.preferences.searchEngine,'google');assert.equal(profile.preferences.cloudProvider,'safebrowsing');assert.equal(profile.preferences.doNotTrack,true);assert.equal(profile.preferences.keepHistory,false);assert.deepEqual(profile.history,[]);assert.deepEqual(profile.lastSession,[]);assert.deepEqual(profile.preferences.trackingExceptions,[]);
  fs.writeFileSync(path.join(directory,'history.json'),JSON.stringify([null,42,{url:'file:///secret'},{url:'https://example.com/',title:null}]));
  fs.writeFileSync(path.join(directory,'tabs.json'),JSON.stringify([null,{},'javascript:alert(1)','https://example.com/']));
  profile=new Profile(directory);assert.equal(profile.history.length,1);assert.equal(profile.history[0].title,'https://example.com/');assert.deepEqual(profile.lastSession,['https://example.com/']);profile.visit('https://example.com/','Page');assert.equal(profile.history[0].title,'https://example.com/');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
