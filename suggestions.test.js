const {test}=require('node:test'),assert=require('node:assert/strict');
const {SearchSuggestions,historySuggestions,searchText}=require('./suggestions');
test('history suggestions: recent sites, frequency, deduplication and text matching',()=>{
 const history=[{url:'https://new.example/a',title:'New page',time:90},{url:'https://popular.example/one',title:'Popular',time:80,visits:4},{url:'https://new.example/a',title:'Old name',time:70},{url:'https://other.example/',title:'Other',time:60},{url:'https://popular.example/two',time:50,visits:3},{url:'javascript:alert(1)',time:100}];
 const results=historySuggestions(history);assert(results.some(item=>item.group==='Часто'&&item.url.startsWith('https://popular.example')));assert.equal(results.filter(item=>item.url==='https://new.example/a').length,1);assert(!results.some(item=>item.url.startsWith('javascript:')));
 const match=historySuggestions(history,'NEW PAGE');assert.equal(match.length,1);assert.equal(match[0].title,'New page');
});
test('online suggestions: opt out, private address suppression, providers, bounded JSON, deduplication and cache',async()=>{
 const calls=[];const service=new SearchSuggestions(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(['mont',['mont saint michel','mont saint michel','montpellier',4]]));});
 for(const query of ['https://example.com/path?token=abc','user@example.com','localhost secret','192.168.1.1','example.com','x','a'.repeat(161)]){assert.equal(searchText(query),'');assert.deepEqual(await service.get({query,engine:'google'},true),[]);}
 assert.deepEqual(await service.get({query:'mont',engine:'google'},false),[]);assert.equal(calls.length,0);
 assert.deepEqual(await service.get({query:'mont',engine:'google'},true),['mont saint michel','montpellier']);assert.equal(calls[0].options.credentials,'omit');assert.equal(new URL(calls[0].url).hostname,'www.google.com');
 await service.get({query:'mont',engine:'google'},true);assert.equal(calls.length,1);
 await service.get({query:'mont',engine:'duckduckgo'},true);assert.equal(new URL(calls[1].url).hostname,'ac.duckduckgo.com');
 await service.get({query:'mont',engine:'yandex'},true);assert.equal(new URL(calls[2].url).searchParams.get('part'),'mont');
 assert.deepEqual(await service.get({query:'mont',engine:'https://evil.example'},true),[]);
 const huge=new SearchSuggestions(async()=>new Response('x'.repeat(70000)));assert.deepEqual(await huge.get({query:'test',engine:'google'},true),[]);
 const bad=new SearchSuggestions(async()=>new Response('<html>error</html>'));assert.deepEqual(await bad.get({query:'test',engine:'google'},true),[]);
});
