(() => {
 const backdrop=document.createElement('img');backdrop.id='suggestion-backdrop';backdrop.alt='';backdrop.hidden=true;document.body.append(backdrop);
 const popup=document.createElement('section');popup.id='search-suggestions';popup.hidden=true;
 popup.setAttribute('aria-label','Подсказки');
 const list=document.createElement('div');list.id='search-suggestion-list';list.setAttribute('role','listbox');
 const footer=document.createElement('div');footer.className='suggestion-footer';
 popup.append(list,footer);document.body.append(popup);
 let active=null,ready=false,items=[],selected=-1,serial=0,focusSerial=0,timer,context={history:[],online:true},local=[],remote=[];
 const inputs=[$('search'),$('address')];
 for(const input of inputs){
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
  input.addEventListener('focus',()=>open(input));
  input.addEventListener('click',()=>{if(active!==input)open(input);});
  input.addEventListener('input',()=>{if(active!==input)open(input);else update();});
  input.addEventListener('compositionstart',()=>{input._composing=true;clearTimeout(timer);serial++;});
  input.addEventListener('compositionend',()=>{input._composing=false;update();});
  input.addEventListener('keydown',event=>{
   if(event.isComposing)return;
   if(event.key==='Escape'&&!popup.hidden){event.preventDefault();event.stopImmediatePropagation();close();return;}
   if(popup.hidden||active!==input)return;
   if(['ArrowDown','ArrowUp'].includes(event.key)&&items.length){event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;mark();}
   if(event.key==='Enter'&&selected>=0){event.preventDefault();event.stopImmediatePropagation();choose(items[selected]);}
  });
  input.form.addEventListener('submit',close,true);
  input.addEventListener('blur',()=>{setTimeout(()=>{if(active===input&&document.activeElement!==input)close();},0);});
 }
 async function open(input){
  if($('home-page').classList.contains('editing-layout')||panelIds.some(id=>!$(id).hidden))return;
  close();active=input;
  const token=++focusSerial;
  const result=await command('suggestion-history')||{history:[],online:true};
  if(token!==focusSerial||active!==input||document.activeElement!==input)return;
  context=result;
  if(input.id==='address'&&panelIds.every(id=>$(id).hidden)){
   const snapshot=await command('suggestion-backdrop');
   if(token!==focusSerial||active!==input||document.activeElement!==input)return;
   if(typeof snapshot==='string'&&snapshot.startsWith('data:image/png;')){
    backdrop.src=snapshot;
    try{await backdrop.decode();}catch{}
    if(token!==focusSerial||active!==input)return;
    backdrop.hidden=false;
   }
  }
  ready=true;update();
 }
 function update(){
  clearTimeout(timer);const token=++serial;if(!active||!ready)return;
  const query=active.value.trim();remote=[];selected=-1;
  local=Array.isArray(context.history)?context.history:[];
  // Matching and ranking stay local; the backend supplies no history to providers.
  const q=query.toLocaleLowerCase();
  if(q){const seen=new Set();local=local.filter(item=>{if(seen.has(item.url)||!(item.title+' '+item.url).toLocaleLowerCase().includes(q))return false;seen.add(item.url);return true;}).slice(0,4).map(item=>({...item,group:'История'}));}
  else local=context.recommended||[];
  if(!local.length){const known=[...saved.map(item=>({url:item.url,title:item.title})),...links.map(item=>({url:item.url,title:item.name}))];const seen=new Set();local=known.filter(item=>{if(seen.has(item.url)||q&&!(item.title+' '+item.url).toLocaleLowerCase().includes(q))return false;seen.add(item.url);return true;}).slice(0,4).map(item=>({...item,group:'Закреплено'}));}
  draw(query);
  if(['google','yandex','duckduckgo','bing'].includes(preferences.engine)&&query.length>=2&&context.online&&!active.matches(':disabled')&&!active._composing){
   const engine=preferences.engine;
   timer=setTimeout(async()=>{
    const response=await command('search-suggest',{query,engine});
    if(token!==serial||!active||active.value.trim()!==query)return;
    remote=Array.isArray(response)?response:[];draw(query);
   },220);
  }
 }
 function draw(query){
  if(!active)return;
  const previous=items[selected]?.value;
  list.replaceChildren();items=[];
  for(const item of local)items.push({...item,kind:'site',value:item.url});
  if(query)items.push({kind:'search',title:query,value:query,group:'Поиск',typed:true});
  const seen=new Set([query.toLocaleLowerCase()]);
  for(const value of remote){if(seen.has(value.toLocaleLowerCase()))continue;seen.add(value.toLocaleLowerCase());items.push({kind:'search',title:value,value,group:'Подсказки'});}
  selected=-1;let group='';
  items.forEach((item,index)=>{
   if(group!==item.group){group=item.group;const label=document.createElement('div');label.className='suggestion-group';label.textContent=group;list.append(label);}
   const row=document.createElement('button');row.type='button';row.className='suggestion-row';row.id='suggestion-'+index;row.setAttribute('role','option');row.setAttribute('aria-selected','false');row.tabIndex=-1;
   row.append(item.kind==='site'?favicon('',item.url,item.title):createIcon('search'));
   const name=document.createElement('span');name.className='suggestion-name';name.textContent=item.title||item.url;row.append(name);
   if(item.kind==='site'){const host=document.createElement('small');try{host.textContent=new URL(item.url).hostname;}catch{}row.append(host);}
   else if(item.typed){const hint=document.createElement('small');hint.textContent='Enter';row.append(hint);}
   row.addEventListener('pointerdown',event=>event.preventDefault());row.onclick=()=>choose(item);
   row.onauxclick=event=>{if(event.button===1&&item.url){event.preventDefault();action('open-tab',item.url);}};
   row.addEventListener('pointermove',()=>{selected=index;mark(false);});
   const option=document.createElement('div');option.className='suggestion-option';option.append(row);
   if(item.kind==='site'&&item.group==='Часто'){
    option.classList.add('has-dismiss');
    const remove=document.createElement('button');remove.type='button';remove.className='suggestion-dismiss';remove.title='Убрать из «Часто»';remove.setAttribute('aria-label','Убрать '+(item.title||item.url)+' из «Часто»');remove.append(createIcon('close'));
    remove.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();});
    remove.onclick=async event=>{
     event.preventDefault();event.stopPropagation();remove.disabled=true;const input=active,token=focusSerial;
     const result=await action('suggestion-dismiss',item.url);
     if(result?.error){remove.disabled=false;return;}
     if(active===input&&token===focusSerial&&result){context=result;update();}
    };
    option.append(remove);
   }
   list.append(option);
  });
  if(!items.length){const empty=document.createElement('p');empty.className='suggestion-empty';empty.textContent='Здесь появятся посещённые сайты. Можно начать вводить запрос.';list.append(empty);}
  const provider=searchEngines.engines.find(engine=>engine.id===preferences.engine)?.name||'Google';
  footer.textContent=query?(context.online?'Подсказки: '+provider+' · ↑ ↓ выбрать · Enter открыть':'Подсказки из интернета выключены · ↑ ↓ выбрать'):'История на этом устройстве';
  popup.hidden=false;active.setAttribute('aria-expanded','true');active.removeAttribute('aria-activedescendant');
  if(previous){selected=items.findIndex(item=>item.value===previous);mark(false);}
  // WebContentsView is a native surface above the shell. Hide it while the
  // address dropdown is open, exactly as for the browser's other overlays.
  command('overlay',true);place();
 }
 function mark(scroll=true){
  for(const [index,row] of [...list.querySelectorAll('.suggestion-row')].entries())row.setAttribute('aria-selected',String(index===selected));
  if(selected>=0&&active){active.setAttribute('aria-activedescendant','suggestion-'+selected);if(scroll)$('suggestion-'+selected)?.scrollIntoView({block:'nearest'});}
 }
 function choose(item){if(!item)return;const value=item.value;close();active=null;go(value);}
 function close(){
  clearTimeout(timer);serial++;focusSerial++;
  if(active){active.setAttribute('aria-expanded','false');active.removeAttribute('aria-activedescendant');}
  const wasOpen=!popup.hidden;popup.hidden=true;backdrop.hidden=true;backdrop.removeAttribute('src');selected=-1;items=[];active=null;ready=false;
  if(wasOpen&&panelIds.every(id=>$(id).hidden))command('overlay',false);
 }
 function place(){
  if(!active||popup.hidden)return;
  // Never overlap the toolbar: it is a native window drag region and would
  // swallow clicks on the top rows of the list.
  const navBottom=()=>document.querySelector('nav')?.getBoundingClientRect().bottom||0;
  const a=(active.id==='address'?active.form:active.closest('.home-widget')||active.form).getBoundingClientRect();
  const width=Math.min(Math.max(a.width,340),innerWidth-32),left=Math.max(16,Math.min(a.left,innerWidth-width-16));
  popup.style.width=width+'px';popup.style.left=left+'px';
  const below=innerHeight-a.bottom-14,above=a.top-14;
  const upwards=active.id==='search'&&below<260&&above>below;
  popup.classList.toggle('opens-up',upwards);
  popup.style.top=upwards?'auto':Math.round(Math.max(a.bottom+7,navBottom()))+'px';popup.style.bottom=upwards?Math.round(innerHeight-a.top+7)+'px':'auto';
  popup.style.maxHeight=Math.max(100,Math.min(440,upwards?above-7:below-7))+'px';
 }
 document.addEventListener('pointerdown',event=>{if(active&&!popup.contains(event.target)&&!inputs.includes(event.target))close();},true);
 window.addEventListener('resize',place);
 window.addEventListener('blur',close);
 document.addEventListener('browser-panel-opening',close);
 window.browser?.onState(()=>{if(active&&document.activeElement!==active)close();});
})();
