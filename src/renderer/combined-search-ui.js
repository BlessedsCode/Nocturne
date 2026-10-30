(() => {
 const section=document.createElement('section');section.id='combined-results';section.hidden=true;section.className='combined-results';
 section.setAttribute('aria-label','Поиск во всех системах');panelIds.push(section.id);
 const header=document.createElement('header');header.className='combined-header';
 const form=document.createElement('form'),input=document.createElement('input');input.id='combined-query';input.required=true;input.maxLength=500;input.autocomplete='off';input.setAttribute('aria-label','Поиск во всех системах');
 const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='Искать';
 const close=document.createElement('button');close.id='close-combined';close.type='button';close.title='Закрыть результаты';close.append(createIcon('close'));close.onclick=()=>closePanels();form.append(input,submit);header.append(form,close);
 const filters=document.createElement('div');filters.className='combined-filters';filters.setAttribute('aria-label','Поисковые системы');
 const options=document.createElement('div');options.className='combined-options';
 const english=document.createElement('input');english.type='checkbox';english.id='combined-english';english.checked=true;
 const label=document.createElement('label');label.append(english,document.createTextNode('Искать и на английском'));
 const retry=element('button','Повторить без кэша');retry.id='combined-retry';retry.className='subtle';retry.onclick=()=>start(input.value,true);
 const translation=element('div','','combined-translation');translation.id='combined-translation';translation.setAttribute('role','status');
 const englishInput=document.createElement('input');englishInput.id='combined-english-query';englishInput.maxLength=500;englishInput.placeholder='Английский запрос — можно изменить';englishInput.setAttribute('aria-label','Английский запрос');
 englishInput.addEventListener('input',()=>englishInput.dataset.manual='true');englishInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();start(input.value,true);}});
 options.append(label,retry);translation.append(englishInput);
 const info=document.createElement('p');info.id='combined-status';info.setAttribute('role','status');
 const list=document.createElement('div');list.id='combined-list';
 const note=document.createElement('p');note.className='combined-note';note.textContent='Одинаковые ссылки объединены. Выше совпадения нескольких систем, затем учитываются места в их выдаче. Если источник запросил проверку, его выдачу можно открыть отдельно.';
 const translationNote=element('small','Автоперевод MyMemory: сервису отправляется только запрос. Можно выключить или ввести свой английский вариант.');translation.append(translationNote);
 const translationStatus=element('span','');translationStatus.id='combined-translation-status';translation.prepend(translationStatus);
 section.append(header,options,translation,filters,info,list,note);document.body.append(section);
 let current=null,filter='all',query='',version=0;
 function element(tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;}
 function draw(){
  if(!current)return;filters.replaceChildren();list.replaceChildren();
  const button=(id,label)=>{const b=element('button',label);b.type='button';b.setAttribute('aria-pressed',String(filter===id));b.onclick=()=>{filter=id;draw();};filters.append(b);};
  button('all','Все · '+current.results.length);
  for(const source of current.sources){const count=source.count??source.results.length;const status={waiting:'ожидание',loading:count?count+'…':'поиск',ready:count+(source.problems?.length?'*':''),challenge:'капча',consent:'согласие',unavailable:'не прочитано'}[source.status];button(source.id,source.name+' · '+status);}
  const completed=current.sources.filter(source=>source.variants?source.variants.every(variant=>!['waiting','loading'].includes(variant.status)):!['waiting','loading'].includes(source.status)).length;
  translation.hidden=!english.checked||current.translation?.status==='not-needed';
  const t=current.translation;
  translationStatus.textContent=t?.status==='translating'?'Переводим запрос…':t?.status==='error'?t.message:t?.text?'Английский запрос':'';
  if(t?.text&&englishInput.dataset.manual!=='true')englishInput.value=t.text;
  info.textContent=current.done?'Найдено ссылок: '+current.results.length:'Ищем… Проверено источников: '+completed+' / '+current.sources.length;
  const results=current.results.filter(result=>filter==='all'||result.sources.some(source=>source.id===filter));
  const sources=filter==='all'?current.sources:current.sources.filter(source=>source.id===filter);
  const notices=[];
  for(const source of sources.filter(source=>source.problems?.length||['challenge','consent','unavailable'].includes(source.status))){
   const problem=source.problems?.[0]?.status||source.status;
   const row=element('div','', 'combined-source-notice');row.append(element('span',source.name+(problem==='challenge'?': требуется проверка человека.':problem==='consent'?': требуется выбор согласия на сайте.':': часть выдачи не удалось прочитать.')));
   const verify=['challenge','consent'].includes(problem);
   const open=element('button',verify?'Открыть проверку':'Открыть выдачу');open.className='subtle';open.onclick=()=>verify?action('search-source-verify',source.id):go(source.url);row.append(open);notices.push(row);
  }
  if(notices.length){const details=document.createElement('details');details.className='combined-unavailable';const summary=element('summary','Источники с ограничениями · '+notices.length);details.append(summary,...notices);details.open=filter!=='all'||!results.length;list.append(details);}
  if(!results.length&&current.done)list.append(element('p','Нет результатов для этого фильтра. Можно открыть обычную выдачу источника.'));
  for(const result of results){
   const article=element('article','','combined-result');const title=element('button',result.title,'combined-title');title.onclick=()=>go(result.url);title.onauxclick=event=>{if(event.button===1){event.preventDefault();action('open-tab',result.url);}};title.oncontextmenu=event=>{event.preventDefault();navigator.clipboard.writeText(result.url);toast('Адрес ссылки скопирован');};
   let host=result.url;try{host=new URL(result.url).hostname;}catch{}
   const address=element('div','','combined-address');address.append(favicon('',result.url,result.title),element('span',host));
   const badges=element('div','','combined-sources');for(const source of result.sources){const languages=(source.languages||['original']).map(language=>language==='en'?'EN':'Исходный').join('/');const badge=element('button',source.name+' · '+languages+' · №'+source.rank);badge.title='Показать результаты '+source.name;badge.onclick=()=>{filter=source.id;draw();};badges.append(badge);}
   article.append(address,title);if(result.snippet)article.append(element('p',result.snippet));article.append(badges);list.append(article);
  }
 }
 async function start(value,force=false){
  value=String(value||'').trim();if(!value)return;
  document.dispatchEvent(new Event('browser-panel-opening'));
  const token=++version,changed=query!==value;query=value;filter='all';input.value=value;
  if(changed){englishInput.value='';delete englishInput.dataset.manual;}
  await closePanels(false);section.hidden=false;command('overlay',true);
  current={id:0,query:value,sources:searchEngines.engines.map(engine=>({...engine,status:'waiting',results:[]})),results:[],done:false};draw();
  const result=await action('search-all',{query:value,english:english.checked,englishQuery:englishInput.dataset.manual==='true'?englishInput.value:'',force});
  if(token!==version)return;if(result?.error){info.textContent=result.error;return;}
  if(!current.id||result.id>=current.id){current=result;draw();}
 }
 form.onsubmit=event=>{event.preventDefault();start(input.value);};
 window.browser.onCombinedSearch(data=>{if(data.query!==query||data.id<(current?.id||0))return;current=data;draw();});
 window.browser.onSearchSourceClosed(data=>{if(!section.hidden&&data.query===query)start(query,true);});
 english.onchange=()=>{translation.hidden=!english.checked||current?.translation?.status==='not-needed';};
 // Closing the surface stops work; already completed result strings remain in memory.
 new MutationObserver(()=>{if(section.hidden)command('search-all-cancel');}).observe(section,{attributes:true,attributeFilter:['hidden']});
 window.openCombinedSearch=start;
})();
