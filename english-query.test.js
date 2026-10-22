const {test}=require('node:test'),assert=require('node:assert/strict');
const {translateEnglish}=require('./english-query');
const {mergeResults}=require('./combined-search');
test('translation: official fixed endpoint, no cookies, bounded input, quota errors and cache',async()=>{
 let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'api.mymemory.translated.net');assert.equal(new URL(url).searchParams.get('langpair'),'ru|en');assert.equal(options.credentials,'omit');return new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'Huawei laptop touchpad drivers'}}));};
 assert.equal(await translateEnglish('тест драйвера huawei',fetcher),'Huawei laptop touchpad drivers');
 await translateEnglish('тест драйвера huawei',fetcher);assert.equal(calls,1);
 assert.equal(await translateEnglish('English query',fetcher),'');assert.equal(calls,1);
 await assert.rejects(()=>translateEnglish('я'.repeat(300),fetcher),/лимита/);assert.equal(calls,1);
 const quota=async()=>new Response(JSON.stringify({responseStatus:429,quotaFinished:true}));
 await assert.rejects(()=>translateEnglish('другой запрос',quota),/лимит/);
});
test('bilingual rank: one vote per engine, language badges, query relevance and domain diversity',()=>{
 const row=(url,title,language='original',rank=1)=>({url,title,language,rank});
 const results=mergeResults([{id:'bing',name:'Bing',results:[row('https://one.example/fix','Huawei touchpad driver fix','original',3),row('https://one.example/fix','Huawei touchpad driver fix','en',1),row('https://other.example/list','General drivers','original',1)]}],'как поставить драйвер тачпада','Huawei touchpad driver');
 assert.equal(results[0].title,'Huawei touchpad driver fix');assert.equal(results[0].sources.length,1);assert.deepEqual(results[0].sources[0].languages,['original','en']);assert.equal(results[0].sources[0].rank,1);
});
