(function(root){
 const engines=[
  {id:'google',name:'Google',url:'https://www.google.com/search',param:'q'},
  {id:'yandex',name:'Яндекс',url:'https://yandex.ru/search/',param:'text'},
  {id:'duckduckgo',name:'DuckDuckGo',url:'https://duckduckgo.com/',param:'q'},
  {id:'bing',name:'Bing',url:'https://www.bing.com/search',param:'q'},
  {id:'brave',name:'Brave Search',url:'https://search.brave.com/search',param:'q'},
  {id:'yahoo',name:'Yahoo',url:'https://search.yahoo.com/search',param:'p'},
  {id:'ecosia',name:'Ecosia',url:'https://www.ecosia.org/search',param:'q'}
 ];
 function searchURL(id,query){const engine=engines.find(e=>e.id===id)||engines[0];const url=new URL(engine.url);url.searchParams.set(engine.param,String(query));return url.href;}
 if(typeof module==='object')module.exports={engines,searchURL};else root.searchEngines={engines,searchURL};
})(globalThis);
