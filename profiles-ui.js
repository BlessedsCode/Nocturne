(() => {
 const personal=api.profile==='personal';
 document.body.dataset.profile=personal?'personal':'main';
 let entrance=0;
 api.onBrowserAction(async message=>{
  if((typeof message==='string'?message:message.action)!=='profile-enter'||!personal)return;
  const token=++entrance;
  const animate=preferences.animations&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('profile-entry-veil')?.remove();
  const veil=document.createElement('section');veil.id='profile-entry-veil';veil.classList.toggle('still',!animate);veil.setAttribute('role','status');veil.setAttribute('aria-live','polite');
  const content=document.createElement('div');content.className='profile-entry-content';
  content.append(text('p','NOCTURNE','profile-entry-wordmark'),text('h1','18+','profile-entry-age'),text('p','ONLY','profile-entry-only'),text('h2','Только для совершеннолетних'),text('p','Это пространство предназначено для лиц старше 18 лет.','profile-entry-warning'));
  const progress=document.createElement('div');progress.className='profile-entry-progress';progress.setAttribute('aria-hidden','true');progress.append(document.createElement('span'));
  content.append(progress,text('p','Открываем пространство','profile-entry-loading'));veil.append(content);document.body.append(veil);
  command('profile-reveal',animate);
  await new Promise(resolve=>setTimeout(resolve,1800));
  if(token!==entrance)return;
  if(animate)await veil.animate([{opacity:1},{opacity:0}],{duration:420,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{});
  if(token!==entrance)return;
  veil.remove();command('profile-intro-complete');
 });
 const hotspot=document.createElement('button');hotspot.type='button';hotspot.id='profile-secret-entry';hotspot.tabIndex=-1;hotspot.setAttribute('aria-hidden','true');hotspot.hidden=true;
 document.querySelector('.settings-content').append(hotspot);
 const about=$('about-section'),settings=$('settings');
 const update=()=>{hotspot.hidden=settings.hidden||about.hidden;};
 const observer=new MutationObserver(update);for(const element of [settings,about])observer.observe(element,{attributes:true,attributeFilter:['hidden']});update();
 let opening=false;
 hotspot.addEventListener('dblclick',async event=>{
  event.preventDefault();if(opening||settings.hidden||about.hidden)return;
  opening=true;try{await action('profile-open',personal?'main':'personal');}finally{opening=false;}
 });
})();
