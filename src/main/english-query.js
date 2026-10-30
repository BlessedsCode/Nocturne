const translations=new Map();
function needsEnglish(query){return /[а-яё]/i.test(query);}
async function translateEnglish(query,fetcher,signal){
 if(!needsEnglish(query))return '';
 if(Buffer.byteLength(query,'utf8')>500)throw new Error('Запрос длиннее лимита перевода. Введи английский вариант вручную.');
 const cached=translations.get(query);if(cached&&Date.now()-cached.time<600000)return cached.value;
 const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',query);url.searchParams.set('langpair','ru|en');
 const response=await fetcher(url.href,{credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000)});
 if(!response.ok)throw new Error('Сервис перевода недоступен. Английский вариант можно ввести вручную.');
 const reader=response.body.getReader();let bytes=0,chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536){await reader.cancel();throw new Error('Некорректный ответ сервиса перевода.');}chunks.push(Buffer.from(value));}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(data.responseStatus!==200||data.quotaFinished)throw new Error('Перевод временно недоступен или исчерпан лимит. Введи английский запрос вручную.');
 const value=String(data.responseData?.translatedText||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
 if(value.length<2||value.length>500||needsEnglish(value)||value.toLowerCase()===query.toLowerCase())throw new Error('Не удалось получить английский перевод. Его можно ввести вручную.');
 translations.set(query,{time:Date.now(),value});if(translations.size>50)translations.delete(translations.keys().next().value);
 return value;
}
module.exports={needsEnglish,translateEnglish};
