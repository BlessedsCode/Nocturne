(() => {
 const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
 const button=(text,fn,cls)=>{const b=make('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const trigger=button('',open,'icon-button');trigger.id='ai-assistant-button';trigger.title='AI-помощник Nocturne';trigger.setAttribute('aria-label',trigger.title);trigger.append(createIcon('ai-assistant'));$('search-all').after(trigger);
 const surface=make('section',null,'ai-assistant');surface.id='ai-assistant';surface.hidden=true;surface.setAttribute('role','dialog');surface.setAttribute('aria-label','AI-помощник Nocturne');panelIds.push(surface.id);
 const head=make('div',null,'ai-head'),brand=make('div',null,'ai-brand'),mark=make('span',null,'ai-mark');mark.append(createIcon('ai-assistant'));brand.append(mark,make('div','NOCTURNE / AI','ai-eyebrow'));const close=button('',()=>closePanels(),'ai-close');close.id='ai-close';close.title='Закрыть помощника';close.setAttribute('aria-label',close.title);close.append(createIcon('close'));head.append(brand,close);
 const intro=make('div',null,'ai-intro');intro.append(make('h2','Любопытство ведёт дальше.'),make('p','Спроси, сравни, найди. Помощник найдёт информацию в сети и покажет источники.'));
 const tools=make('div',null,'ai-tools'),connection=make('span','Gemini · Поиск Nocturne');tools.append(connection,button('Подключение',()=>{setup.hidden=!setup.hidden;}),button('Новый диалог',()=>{cancel();messages=[];thread.replaceChildren();status.textContent='Диалог очищен';}));
 const setup=make('form',null,'ai-setup');setup.id='ai-setup';setup.hidden=true;
 const key=make('input');key.id='ai-key';key.type='password';key.autocomplete='off';key.maxLength=256;key.placeholder='API-ключ из Google AI Studio';key.setAttribute('aria-label','API-ключ Gemini');
 const save=make('button','Сохранить ключ','primary');save.type='button';save.id='ai-save-key';
 const keyStatus=make('div','','ai-key-status');keyStatus.id='ai-key-status';keyStatus.setAttribute('role','status');keyStatus.setAttribute('aria-live','polite');
 setup.append(make('p','Gemini имеет бесплатный тариф с ограничениями. Получи личный ключ в Google AI Studio без подключения платного тарифа. Доступность зависит от региона и квот.'),button('Получить бесплатный ключ ↗',()=>action('ai-get-key')),key,save,button('Удалить ключ',async()=>{const r=await action('ai-key','');if(r?.error){status.textContent=r.error;return;}configured=false;connection.textContent='Gemini · не подключён';status.textContent='Ключ удалён';}));
 setup.append(keyStatus);
 setup.append(make('small','Ключ шифруется Windows. При отправке вопрос передаётся поисковым системам, а диалог и найденные фрагменты — в Gemini. На бесплатном тарифе Google может использовать запросы для улучшения моделей. История чата хранится только до закрытия браузера.'));
 const thread=make('div',null,'ai-thread');thread.id='ai-thread';thread.setAttribute('role','log');thread.setAttribute('aria-live','polite');
 const ideas=make('div',null,'ai-ideas');for(const text of ['Найди интересные места для поездки','Объясни сложную тему простыми словами','Помоги сравнить несколько вариантов'])ideas.append(button(text,()=>{input.value=text;input.focus();}));
 const form=make('form',null,'ai-compose'),input=make('textarea');input.id='ai-prompt';input.rows=2;input.maxLength=12000;input.required=true;input.placeholder='Что ты хочешь узнать?';input.setAttribute('aria-label','Сообщение AI-помощнику');
 const send=make('button','Отправить','primary');send.id='ai-send';send.type='submit';const stop=button('Остановить',cancel);stop.id='ai-stop';stop.hidden=true;form.append(input,send,stop);
 const status=make('div','','ai-status');status.id='ai-status';status.setAttribute('role','status');const note=make('small','Ответы AI могут содержать ошибки. Проверяй важные сведения по источникам.','ai-note');
 surface.append(head,intro,tools,setup,thread,ideas,form,status,note);document.body.append(surface);
 let messages=[],busy=false,serial=0,configured=false;
 function pending(value){busy=value;send.disabled=value;stop.hidden=!value;}
 function cancel(){serial++;command('ai-cancel');pending(false);}
 function bubble(role,text,sources=[]){const article=make('article',null,'ai-message ai-'+role);article.append(make('div',role==='user'?'Ты':'Nocturne AI','ai-author'),role==='model'?renderAIAnswer(text,sources):make('div',text,'ai-text'));thread.append(article);article.scrollIntoView({block:'nearest'});return article;}
 async function open(){if(!surface.hidden){input.focus();return;}await panel(surface.id);const s=await action('ai-status');configured=!!s?.configured;setup.hidden=configured;connection.textContent=configured?'Gemini · Поиск Nocturne':'Gemini · не подключён';const value=$('address').value.trim(),tab=state.tabs.find(t=>t.id===state.active);if(value&&value!==tab?.url)input.value=value;else if(!tab?.url)input.value=$('search').value.trim();input.focus();}
 let savingKey=false;
 async function saveKey(event){
  event?.preventDefault();if(savingKey)return;
  const value=key.value.trim();if(!value){keyStatus.textContent='Вставь API-ключ из Google AI Studio.';key.focus();return;}
  savingKey=true;save.disabled=true;save.textContent='Сохраняем…';keyStatus.textContent='Шифруем ключ в хранилище Windows…';
  const slow=setTimeout(()=>{keyStatus.textContent='Windows ещё подготавливает защищённое хранилище. Подожди немного…';},5000);
  try{
   const result=await command('ai-key',value);
   if(result?.error)throw new Error(result.error);
   if(!result?.configured)throw new Error('Не удалось подтвердить сохранение ключа. Перезапусти Nocturne и попробуй ещё раз.');
   configured=true;key.value='';setup.hidden=true;connection.textContent='Gemini · Поиск Nocturne';keyStatus.textContent='';status.textContent='Ключ сохранён. Можно задать вопрос.';
  }catch(error){keyStatus.textContent=error.message||'Не удалось сохранить ключ.';keyStatus.scrollIntoView({block:'nearest'});}
  finally{clearTimeout(slow);savingKey=false;save.disabled=false;save.textContent='Сохранить ключ';}
 }
 save.onclick=saveKey;setup.onsubmit=saveKey;
 key.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();saveKey();}};

 form.onsubmit=async event=>{
  event.preventDefault();const text=input.value.trim();if(!text||busy)return;if(!configured){setup.hidden=false;status.textContent='Сначала подключи бесплатный API-ключ.';key.focus();return;}
  const token=++serial;pending(true);status.textContent='Помощник думает и проверяет источники…';ideas.hidden=true;input.value='';bubble('user',text);
  const context=[...messages,{role:'user',text}].slice(-19);while(context.length&&context[0].role!=='user')context.shift();
  const result=await action('ai-ask',context);if(token!==serial)return;pending(false);
  if(!result||result.error){status.textContent=result?.error||'Не удалось получить ответ.';input.value=text;return;}
  messages=[...context,{role:'model',text:result.text}];const reply=bubble('model',result.text,result.sources||[]);
  if(result.sources?.length){const sources=make('div',null,'ai-sources');sources.append(make('div','Источники','ai-author'));for(const [index,source] of result.sources.entries()){const link=aiSafeLink((index+1)+'. '+source.title,source.url);sources.append(link);}reply.append(sources);}
  if(result.searchEntryPoint){const frame=make('iframe');frame.title='Поисковые подсказки Google';frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.referrerPolicy='no-referrer';frame.src='data:text/html;charset=utf-8,'+encodeURIComponent(result.searchEntryPoint);frame.className='ai-google-entry';reply.append(frame);}
  status.textContent=result.searched?'Ответ с веб-поиском Nocturne · ссылки выше':'Ответ модели · поиск в сети не использовался';thread.scrollTop=reply.offsetTop-thread.offsetTop;input.focus({preventScroll:true});
 };
 input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
 new MutationObserver(()=>{if(surface.hidden){cancel();trigger.focus();}}).observe(surface,{attributes:true,attributeFilter:['hidden']});
})();
