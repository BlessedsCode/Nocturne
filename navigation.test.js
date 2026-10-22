const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveAddress}=require('./navigation');
test('addresses, search and internal home',()=>{
 assert.equal(resolveAddress('example.com'),'https://example.com/');
 assert.equal(resolveAddress('https://example.com/a'),'https://example.com/a');
 assert.equal(resolveAddress('nocturne://home'),null);
 assert.equal(resolveAddress('dark art'),'https://www.google.com/search?q=dark%20art');
});
test('rejects privileged schemes',()=>{
 for(const url of ['file:///C:/Windows','javascript:alert(1)','data:text/html,hello'])assert.throws(()=>resolveAddress(url));
});
