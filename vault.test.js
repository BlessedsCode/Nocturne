const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {Vault,parsePasswords,decodeCSV}=require('./vault');

test('Zen/Firefox exports, spreadsheet delimiters and UTF-16 preserve passwords exactly',()=>{
 const csv='"url","username","password","httpRealm","formActionOrigin","guid","timeCreated"\r\n"https://zen.example/login","тест","a,b;\"\"c\nд","","https://zen.example","id",0';
 const parsed=parsePasswords(decodeCSV(Buffer.from(csv,'utf8')));assert.equal(parsed.entries[0].username,'тест');assert.equal(parsed.entries[0].password,'a,b;"c\nд');
 const semicolon='url;username;password\r\nhttps://example.com;user;" pass;word "';
 assert.equal(parsePasswords(decodeCSV(Buffer.concat([Buffer.from([255,254]),Buffer.from(semicolon,'utf16le')]))).entries[0].password,' pass;word ');
 assert.equal(parsePasswords('url\tusername\tpassword\nhttps://example.com\tuser\tp,;x').entries[0].password,'p,;x');
 assert.throws(()=>decodeCSV(Buffer.from([0xff,0x80,0x81])),/кодировку/);
});
test('Chrome/Firefox CSV: BOM, CRLF, commas, escaped quotes, multiline, invalid schemes',()=>{
 const csv='\uFEFFname,url,username,password,note\r\nExample,https://example.com/login,"a,b","p""ass\nword",\r\nOther,javascript:alert(1),x,y,\r\n';
 const result=parsePasswords(csv);
 assert.equal(result.entries.length,1);assert.equal(result.skipped,1);
 assert.equal(result.entries[0].origin,'https://example.com');assert.equal(result.entries[0].username,'a,b');assert.equal(result.entries[0].password,'p"ass\nword');
 assert.equal(parsePasswords('url,username,password\nhttps://example.com,user,password').entries.length,1);
 assert.throws(()=>parsePasswords('url,username\nx,y'),/колонками/);assert.throws(()=>parsePasswords('url,username,password\n"unterminated'),/кавычка/);
});
test('encrypted persistence, deduplication, metadata-only list, serialized changes, locked crypto',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'nocturne-vault-test-'));
 const key=randomBytes(32);
 const crypto={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async s=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(s,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]);},decryptStringAsync:async b=>{const cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return {result:Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString()};}};
 try{
  const vault=new Vault(folder,crypto);
  const results=await Promise.all([vault.importCSV('url,username,password\nhttps://example.com,a,SYNTHETIC_SECRET_ONE'),vault.importCSV('url,username,password\nhttps://example.com,a,SYNTHETIC_SECRET_TWO')]);
  assert.equal(results[0].added,1);assert.equal(results[1].updated,1);
  const entries=await new Vault(folder,crypto).list();assert.equal(entries.length,1);assert.equal('password' in entries[0],false);
  assert.equal((await vault.get(entries[0].id)).password,'SYNTHETIC_SECRET_TWO');
  assert.equal((await fs.readFile(vault.file)).includes(Buffer.from('SYNTHETIC_SECRET')),false);
  await vault.remove(entries[0].id);assert.equal((await vault.list()).length,0);
  const locked=new Vault(folder,{isAsyncEncryptionAvailable:async()=>false});await assert.rejects(locked.list(),/недоступно/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
