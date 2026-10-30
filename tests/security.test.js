const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {BrowserSecurity,parseDomains,matches}=require('../src/main/security');
const {createScanner}=require('../src/main/defender');
const {safeFilename,dangerousName}=require('../src/main/download-names');
const testRoot=path.resolve('artifacts','unit-security');
async function fixture(){await fs.mkdir(testRoot,{recursive:true});const directory=await fs.mkdtemp(path.join(testRoot,'case-'));await fs.writeFile(path.join(directory,'threats.txt'),'danger.test\n');await fs.writeFile(path.join(directory,'trackers.txt'),'tracker.test\nexample.co.uk\n');const preferences={threatProtection:true,trackerProtection:true,httpsOnly:true,cloudProtection:false,cloudProvider:'safebrowsing',trackingExceptions:[]};const security=new BrowserSecurity({directory,getPreferences:()=>preferences,fetch:async()=>{throw new Error('offline');},crypto:{isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async s=>Buffer.from('test-only:'+s),decryptStringAsync:async b=>({result:b.toString().slice(10)})}});return {directory,preferences,security};}
async function cleanup(directory){assert(directory.startsWith(testRoot+path.sep));await fs.rm(directory,{recursive:true,force:true});}
test('Windows download names: executable suffixes, reserved names, ADS and bidi controls',()=>{
 assert.equal(safeFilename('CON.txt'),'download-CON.txt');assert.equal(safeFilename('file.txt:evil.exe'),'file.txt_evil.exe');
 assert.equal(safeFilename('file.exe. '),'file.exe');assert.equal(dangerousName('file.exe. '),true);assert.equal(dangerousName('file.txt'),false);assert.equal(dangerousName('file\u202ecod.txt'),true);assert.equal(dangerousName('disk.iso'),true);
});
test('domain parsing, suffix boundaries, HTTPS gate, same-site PSL, tracker exceptions',async()=>{
 const {directory,preferences,security:s}=await fixture();try{
 assert.equal(parseDomains('# comment\nmalware.test\ninvalid/path\n*.bad.test').size,2);
 assert.equal(matches(new Set(['danger.test']),'evil.danger.test'),'danger.test');assert.equal(matches(new Set(['danger.test']),'notdanger.test'),'');
 assert.equal(s.localVerdict('https://sub.danger.test',{main:true}).kind,'malware');assert.equal(s.localVerdict('https://notdanger.test',{main:true}),null);
 assert.equal(s.localVerdict('http://plain.test',{main:true}).kind,'http');s.allowHTTP('http://plain.test');assert.equal(s.localVerdict('http://plain.test',{main:true}),null);assert.equal(s.localVerdict('http://other.test',{main:true}).kind,'http');assert.equal(s.localVerdict('http://localhost:8080',{main:true}),null);
 assert.equal(s.localVerdict('https://tracker.test/pixel',{topURL:'https://site.test'}).kind,'tracker');assert.equal(s.localVerdict('https://tracker.test',{main:true}),null);
 assert.equal(s.localVerdict('https://assets.example.co.uk',{topURL:'https://login.example.co.uk'}),null);
 preferences.trackingExceptions=s.exception('site.test');assert.equal(s.localVerdict('https://tracker.test',{topURL:'https://site.test'}),null);assert.equal(s.localVerdict('https://danger.test',{topURL:'https://site.test'}).kind,'malware');
 assert.equal(s.localVerdict('file:///C:/Windows',{main:true}).kind,'protocol');assert.equal(s.localVerdict('https://user:secret@site.test',{main:true}).kind,'credentials');
 }finally{await cleanup(directory);}
});
test('cloud reputation: no traffic without opt-in, unsafe verdicts, caching, fail-closed errors, key not in status',async()=>{
 const {directory,preferences,security:s}=await fixture();try{
 let requests=0;s.fetch=async(url,options)=>{requests++;assert.match(url,/safebrowsing/);assert.equal(JSON.parse(options.body).threatInfo.threatEntries[0].url,'https://target.test/path?q=1');return {ok:true,json:async()=>({matches:[{threatType:'SOCIAL_ENGINEERING'}]})};};
 assert.equal(await s.cloudVerdict('https://target.test/path?q=1'),null);assert.equal(requests,0);
 preferences.cloudProtection=true;assert.equal((await s.cloudVerdict('https://target.test')).kind,'cloud-unavailable');
 await s.setKey('synthetic-key');assert.equal(JSON.stringify(s.status()).includes('synthetic-key'),false);
 assert.equal((await s.cloudVerdict('https://target.test/path?q=1#fragment')).kind,'phishing');assert.equal((await s.cloudVerdict('https://target.test/path?q=1')).kind,'phishing');assert.equal(requests,1);
 s.fetch=async()=>{throw new Error('network');};assert.equal((await s.cloudVerdict('https://another.test')).kind,'cloud-unavailable');assert.equal(await s.cloudVerdict('http://127.0.0.1'),null);
 }finally{await cleanup(directory);}
});
test('failed filter update preserves known-good lists',async()=>{const {directory,security:s}=await fixture();try{await s.update();assert.equal(s.lists.threats.domains.has('danger.test'),true);assert.match(s.status().updateError,/предыдущие списки/);}finally{await cleanup(directory);}});
test('Defender scanner: clean fingerprint, nonzero blocks, timeout stays unknown, file mutation blocks',async()=>{
 const {directory}=await fixture();try{
 const file=path.join(directory,'safe.txt');await fs.writeFile(file,'harmless');
 let scanner=createScanner({executable:'test-scanner',execute:async()=>({code:0})});assert.equal((await scanner.scan(file)).state,'clean');
 scanner=createScanner({executable:'test-scanner',execute:async()=>({code:2})});assert.equal((await scanner.scan(file)).state,'blocked');
 scanner=createScanner({executable:'test-scanner',execute:async()=>({code:'TIMEOUT',timeout:true})});assert.equal((await scanner.scan(file)).state,'error');
 scanner=createScanner({executable:'test-scanner',execute:async()=>{await fs.writeFile(file,'changed');return {code:0};}});assert.equal((await scanner.scan(file)).state,'blocked');
 scanner=createScanner({executable:''});assert.equal((await scanner.scan(file)).state,'unavailable');
 }finally{await cleanup(directory);}
});
