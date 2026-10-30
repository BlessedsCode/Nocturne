function decodeSession(value){
 const legacy=Array.isArray(value),source=legacy?value:value?.version===2&&Array.isArray(value.tabs)?value.tabs:[];
 const tabs=[];let active=0;
 for(let i=0;i<source.length&&tabs.length<40;i++){
  const item=legacy?{url:source[i]}:source[i];if(!item||typeof item.url!=='string')continue;
  let url=item.url;
  if(url){try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)continue;url=parsed.href;}catch{continue;}}
  else if(legacy)continue;
  if(!legacy&&i===value.active)active=tabs.length;
  tabs.push({url,title:typeof item.title==='string'?item.title.slice(0,240):url?new URL(url).hostname:'Новая вкладка',favicon:typeof item.favicon==='string'&&/^https?:\/\//i.test(item.favicon)?item.favicon.slice(0,4096):'',neverDiscard:item.neverDiscard===true,...(item.muted===true?{muted:true}:{})});
 }
 return {version:2,active,tabs};
}
module.exports={decodeSession};
