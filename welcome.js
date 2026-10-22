(() => {
 const colors=[['moss','Мох'],['slate','Сланец'],['wine','Бордо'],['ink','Чернила']];
 const dialog=document.createElement('dialog');dialog.id='welcome-dialog';dialog.className='welcome-dialog';
 dialog.setAttribute('aria-label','Начальная настройка Nocturne');document.body.append(dialog);
 let step=0,detected=[],selectedBrowser='',scanSerial=0;
 const el=(tag,value,className)=>{const node=document.createElement(tag);if(value)node.textContent=value;if(className)node.className=className;return node;};
 const btn=(label,id,click,className='subtle')=>{const node=el('button',label,className);node.type='button';node.id=id;node.onclick=click;return node;};
 const field=(label,input)=>{const wrap=el('label',label,'field-label');wrap.append(input);return wrap;};
 const status=el('p','','import-notice');status.setAttribute('role','status');

 let importProgress=null;
 window.browser.onPasswordImportProgress(result=>importProgress?.(result));
 function browserPicker(container,prefix){
  container.replaceChildren();const choices=el('div','','auto-import-choices'),results=el('div','','auto-import-results');results.setAttribute('aria-live','polite');
  const selected=new Set(),reports=new Map();let busy=false;
  const runButton=btn('Перенести выбранные пароли',prefix+'-auto',()=>run([...selected]),'primary');runButton.disabled=true;
  for(const browser of detected){const label=el('label','','auto-import-choice'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id=prefix+'-select-'+browser.id;checkbox.dataset.browserId=browser.id;checkbox.disabled=!browser.profiles;checkbox.onchange=()=>{if(checkbox.checked)selected.add(browser.id);else selected.delete(browser.id);runButton.disabled=busy||!selected.size;};const info=el('span');info.append(el('strong',browser.name),el('small',browser.profiles?'Профилей с данными паролей: '+browser.profiles:'Сохранённые пароли не найдены'));label.append(checkbox,info);choices.append(label);}
  if(!detected.length)choices.append(el('p','Установленные браузеры не найдены. Для переносного браузера доступен ручной выбор ниже.'));
  const notice=el('p','','import-notice');notice.id=prefix+'-auto-status';
  function draw(){results.replaceChildren();for(const result of reports.values()){
   const row=el('div','','auto-import-result');row.dataset.browserId=result.id;row.append(el('strong',result.name),el('p',result.status==='working'?'Переносим пароли…':result.message));
   if(result.status!=='working')row.append(el('small',`Добавлено: ${result.added} · Обновлено: ${result.updated} · Пропущено: ${result.skipped} · Защищено: ${result.blocked} · Ошибок: ${result.failed}`));
   if(result.locked){const unlock=btn('Ввести основной пароль',prefix+'-unlock-'+result.id,()=>unlockSource(result.id));unlock.disabled=busy;row.append(unlock);}results.append(row);
  }}
  importProgress=result=>{if(container.isConnected){reports.set(result.id,result);draw();}};
  async function run(ids,passwords={}){
   if(busy||!ids.length)return;busy=true;runButton.disabled=true;choices.querySelectorAll('input').forEach(input=>input.disabled=true);notice.textContent='Не закрывай Nocturne: переносим пароли локально…';
   try{const result=await action('passwords-import-auto',{ids,passwords});if(Array.isArray(result)){for(const report of result)reports.set(report.id,report);notice.textContent=[...reports.values()].some(report=>report.locked||report.blocked||report.failed)?'Перенос завершён с ограничениями — подробности ниже.':'Готово. Пароли сохранены в текущем профиле Nocturne.';await loadPasswords();}else notice.textContent=result?.error||'Не удалось завершить перенос.';}
   finally{for(const key of Object.keys(passwords))passwords[key]='';busy=false;runButton.disabled=!selected.size;for(const input of choices.querySelectorAll('input'))input.disabled=!detected.find(browser=>browser.id===input.dataset.browserId)?.profiles;draw();}
  }
  function unlockSource(id){
   const prompt=document.createElement('dialog');prompt.className='welcome-dialog';prompt.id='import-primary-password';const form=document.createElement('form'),password=document.createElement('input');password.type='password';password.autocomplete='current-password';password.required=true;password.maxLength=1024;password.id='import-primary-value';
   const title=detected.find(browser=>browser.id===id)?.name||'Браузер';form.append(el('h2','Основной пароль — '+title),el('p','Используется один раз для переноса. В Nocturne не сохраняется.'),field('Основной пароль исходного браузера',password));const actions=el('div','','welcome-actions');actions.append(btn('Отмена','import-primary-cancel',()=>prompt.close()),btn('Продолжить перенос','import-primary-submit',()=>form.requestSubmit(),'primary'));form.append(actions);prompt.append(form);document.body.append(prompt);form.onsubmit=event=>{event.preventDefault();const value=password.value;password.value='';prompt.close();run([id],{[id]:value});};prompt.addEventListener('close',()=>{password.value='';prompt.remove();});prompt.showModal();password.focus();
  }
  container.append(el('p','Отметь браузеры. Доступные пароли из всех найденных профилей перенесутся автоматически, без CSV.'),choices,runButton,notice,results,el('small','Защита исходного браузера может потребовать основной пароль или подтверждение Windows. Пароли с App-Bound защитой могут быть недоступны для автоматического переноса.'));
  const fallback=document.createElement('details');fallback.className='import-fallback';fallback.append(el('summary','Резервный способ: CSV или переносной браузер'));const legacy=el('div');legacyPicker(legacy,prefix);fallback.append(legacy);container.append(fallback);
 }
 function legacyPicker(container,prefix){
  container.replaceChildren();
  if(!detected.length){container.append(el('p','Браузеры не найдены в стандартных папках и реестре Windows. Если у тебя переносная версия, выбери экспортированный CSV вручную.'));}
  else {
   const select=document.createElement('select');select.id=prefix+'-browser';
   for(const browser of detected){const option=el('option',browser.name);option.value=browser.id;select.append(option);}
   if(!detected.some(browser=>browser.id===selectedBrowser))selectedBrowser=detected[0].id;
   select.value=selectedBrowser;select.onchange=()=>{selectedBrowser=select.value;steps.textContent=detected.find(browser=>browser.id===selectedBrowser)?.steps||'';};
   const steps=el('p',detected.find(browser=>browser.id===selectedBrowser)?.steps||'','export-steps');
   const open=btn('Открыть менеджер паролей',prefix+'-open',async()=>{
    open.disabled=true;const result=await action('browser-open-export',selectedBrowser);open.disabled=false;
    notice.textContent=result?.opened?'В исходном браузере выбери экспорт в CSV. Затем вернись сюда и выбери файл.':result?.error||'Не удалось открыть браузер.';
   });
   container.append(field('Найденные браузеры',select),steps,open);
  }
  const notice=el('p','','import-notice');notice.id=prefix+'-notice';notice.setAttribute('role','status');
  const manual=btn('Указать переносной браузер…',prefix+'-manual',async()=>{
   manual.disabled=true;try{const result=await action('browser-select-export');if(!result?.canceled)notice.textContent=result?.opened?result.name+': '+result.steps:result?.error||'Не удалось открыть браузер.';}finally{manual.disabled=false;}
  });container.append(manual);
  const choose=btn('Выбрать CSV и импортировать',prefix+'-csv',async()=>{
   choose.disabled=true;notice.textContent='';
   try{const result=await action('passwords-import');if(result?.error)notice.textContent=result.error;else if(result&&!result.canceled){notice.textContent=`Добавлено: ${result.added}. Обновлено: ${result.updated}. Пропущено: ${result.skipped}. Теперь можно удалить CSV.`;if(typeof loadPasswords==='function')await loadPasswords();}}
   finally{choose.disabled=false;}
  });
  container.append(choose,notice,el('small','CSV содержит открытые пароли. После переноса удали файл. В Nocturne пароли сохраняются зашифрованными средствами Windows.'));
 }
 async function scan(container,prefix){
  const token=++scanSerial;container.replaceChildren(el('p','Ищем браузеры…'));
  const result=await command('passwords-discover');
  if(token!==scanSerial)return;
  if(result?.error){container.replaceChildren(el('p',result.error));return;}
  detected=Array.isArray(result)?result:[];browserPicker(container,prefix);
 }
 function render(){
  dialog.replaceChildren();
  const top=el('div','','welcome-heading');top.append(el('span','NOCTURNE'),el('span',(step+1)+' / 3'));dialog.append(top);
  const title=['Выбери свой цвет','Где будем искать?','Перенесём пароли?'][step];dialog.append(el('h1',title));
  const content=el('div','','welcome-content');dialog.append(content);
  if(step===0){
   content.append(el('p','Цвет и фон можно поменять позже в настройках.'));
   const choices=el('div','','color-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','Цвет интерфейса');
   for(const [id,name] of colors){const choice=btn(name,'welcome-color-'+id,()=>{preferences.interfaceColor=id;applyPreferences();for(const button of choices.children)button.setAttribute('aria-pressed',String(button===choice));},'color-choice');choice.dataset.color=id;choice.setAttribute('aria-pressed',String((preferences.interfaceColor||'moss')===id));choices.append(choice);}content.append(choices);
   const wallpaper=document.createElement('select');wallpaper.id='welcome-wallpaper';
   for(const [id,name] of [['mont','Мон-Сен-Мишель'],['portrait','Портрет']]){const option=el('option',name);option.value=id;wallpaper.append(option);}wallpaper.value=preferences.wallpaper;wallpaper.onchange=()=>{preferences.wallpaper=wallpaper.value;applyPreferences();};content.append(field('Фон новой вкладки',wallpaper));
   const motion=document.createElement('input');motion.type='checkbox';motion.id='welcome-motion';motion.checked=preferences.animations;motion.onchange=()=>{preferences.animations=motion.checked;applyPreferences();};const toggle=el('label','Плавные анимации','toggle');toggle.append(motion);content.append(toggle);
  }
  if(step===1){
   content.append(el('p','Эта система будет использоваться в адресной строке и на главной.'));
   const select=document.createElement('select');select.id='welcome-engine';for(const engine of searchEngines.engines){const option=el('option',engine.name);option.value=engine.id;select.append(option);}select.value=preferences.engine;select.onchange=()=>{preferences.engine=select.value;applyPreferences();};content.append(field('Поисковая система',select));
   content.append(el('p','Кнопка справа в адресной строке ищет сразу в семи системах: Google, Яндекс, DuckDuckGo, Bing, Brave Search, Yahoo и Ecosia. Результаты собираются на одной странице с отметками источников.'));
  }
  if(step===2){
   content.append(el('p','Nocturne найдёт браузеры и их профили. Выбери нужные галочками и запусти автоматический перенос.'));
   const list=el('div','','browser-import-controls');content.append(list);scan(list,'welcome-import');
  }
  const actions=el('div','','welcome-actions');
  const back=btn('Назад','welcome-back',()=>{step--;render();});back.disabled=step===0;
  const next=btn(step===2?'Начать':'Дальше','welcome-next',async()=>{if(step<2){step++;render();}else await complete();},'primary');
  actions.append(back,btn(step===2?'Перенести позже':'Настроить позже','welcome-skip',complete),next);dialog.append(status,actions);
 }
 async function complete(){
  const next=$('welcome-next');if(next)next.disabled=true;
  const result=await action('settings-update',{firstRunComplete:true});
  if(result?.error){status.textContent=result.error;if(next)next.disabled=false;return;}
  scanSerial++;dialog.close();command('overlay',false);
 }
 function show(){step=0;status.textContent='';render();command('overlay',true);dialog.showModal();}
 dialog.addEventListener('cancel',event=>{event.preventDefault();complete();});
 $('reopen-welcome').onclick=async()=>{await closePanels(false);show();};
 $('detect-browsers').onclick=()=>scan($('detected-browsers'),'settings-import');
 // The first-run flag is in the Windows profile, shared by packaged restarts.
 command('settings-get').then(settings=>{if(settings&&settings.firstRunComplete===false)show();});

 const allDialog=document.createElement('dialog');allDialog.id='all-search-dialog';allDialog.className='welcome-dialog all-search-dialog';
 allDialog.setAttribute('aria-label','Поиск во всех системах');
 const form=document.createElement('form'),input=document.createElement('input');input.id='all-search-query';input.required=true;input.maxLength=500;input.placeholder='Что найти?';input.autocomplete='off';
 form.append(el('h2','Искать везде'),el('p','Google · Яндекс · DuckDuckGo · Bing · Brave Search · Yahoo · Ecosia. Общая выдача с объединением одинаковых ссылок.'),field('Поисковый запрос',input));
 const allActions=el('div','','welcome-actions');allActions.append(btn('Отмена','cancel-all-search',()=>allDialog.close()),btn('Искать во всех','submit-all-search',()=>form.requestSubmit(),'primary'));form.append(allActions);allDialog.append(form);document.body.append(allDialog);
 async function runAll(query){await window.openCombinedSearch(query);}
 form.onsubmit=async event=>{event.preventDefault();const query=input.value.trim();if(!query)return;allDialog.close();await runAll(query);};
 allDialog.addEventListener('close',()=>{if(panelIds.every(id=>$(id).hidden)&&!dialog.open)command('overlay',false);});
 const all=$('search-all');all.classList.add('icon-button');all.append(createIcon('search-all'));all.title='Искать во всех: Google, Яндекс, DuckDuckGo, Bing, Brave, Yahoo, Ecosia';
 all.onclick=async()=>{
  const address=$('address').value.trim(),tab=state.tabs.find(tab=>tab.id===state.active);
  const query=address&&address!==tab?.url?address:(!tab?.url?$('search').value.trim():'');
  if(query){await runAll(query);return;}
  command('overlay',true);input.value='';allDialog.showModal();input.focus();
 };
})();
