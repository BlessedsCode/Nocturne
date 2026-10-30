(() => {
 const background=document.createElement('img');background.id='site-overlay-background';background.alt='';background.hidden=true;document.body.append(background);
 let backgroundToken=0;
 window.browser.onOverlayBackground(async data=>{
  backgroundToken=data.token;
  if(data.clear){background.hidden=true;background.removeAttribute('src');document.body.classList.remove('site-overlay-open');return;}
  if(data.image){background.src=data.image;try{await background.decode();}catch{}}
  if(backgroundToken!==data.token)return;
  background.hidden=false;document.body.classList.add('site-overlay-open');
  command('overlay-ready',data.token);
 });
 background.addEventListener('pointerdown',()=>closePanels());
 const bar=document.createElement('form');bar.id='page-find';bar.hidden=true;bar.setAttribute('aria-label','Поиск на странице');
 const input=document.createElement('input');input.id='page-find-query';input.placeholder='Найти на странице';input.autocomplete='off';input.setAttribute('aria-label','Найти на странице');
 const count=document.createElement('span');count.id='page-find-count';count.setAttribute('role','status');
 function button(id,name,icon,click){const node=document.createElement('button');node.type='button';node.id=id;node.title=name;node.setAttribute('aria-label',name);node.append(createIcon(icon));node.onclick=click;return node;}
 const run=forward=>command('page-find',{text:input.value,forward,findNext:true});
 const close=()=>{bar.hidden=true;command('page-find-close');};
 bar.append(input,count,button('page-find-previous','Предыдущее · Shift+Enter','up',()=>run(false)),button('page-find-next','Следующее · Enter','down',()=>run(true)),button('page-find-close','Закрыть · Escape','close',close));(document.querySelector('nav')||document.body).append(bar);
 input.oninput=()=>command('page-find',{text:input.value,findNext:false,forward:true});
 bar.onsubmit=event=>{event.preventDefault();run(true);};
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();run(!event.shiftKey);}if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!bar.hidden){event.preventDefault();event.stopImmediatePropagation();close();}},true);
 window.browser.onFindResult(result=>{count.textContent=result.matches?result.activeMatchOrdinal+' / '+result.matches:'0 / 0';});
 window.browser.onBrowserAction(async message=>{
  const name=typeof message==='string'?message:message.action;
  if(name==='toast'){toast(message.message);return;}
  if(name==='find'){bar.hidden=false;input.focus();input.select();if(input.value)run(true);return;}
  if(name==='close-find'){bar.hidden=true;return;}
  if(name==='close-panels'){await closePanels(false);return;}
  if(name==='downloads')return panel('downloads-panel');
  if(['history','privacy'].includes(name)){if($('settings').hidden)await panel('settings');selectSettingsSection(name);return;}
  if(name==='bookmark')$('bookmark').click();
 });
})();
