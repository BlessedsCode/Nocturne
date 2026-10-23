(()=>{
 const card=document.createElement('div');card.className='setting-card';card.id='default-browser-card';
 const output=text('p','Проверяем настройки Windows…');output.id='default-browser-status';output.setAttribute('role','status');
 const choose=button('Сделать браузером по умолчанию','Выбрать Nocturne в настройках Windows',async()=>{choose.disabled=true;try{const result=await action('default-browser-open');if(!result?.error)output.textContent='В Windows нажми «Задать по умолчанию» для Nocturne. В Windows 10 выбери его в разделе «Веб-браузер».';}finally{choose.disabled=false;}},'primary');choose.id='default-browser-open';
 card.append(text('h3','Браузер по умолчанию'),output,choose,text('small','Выбор подтверждается в Windows. После этого ссылки из других программ будут открываться в Nocturne.'));
 $('general-section').children[0].after(card);
 let busy=false;
 async function refresh(){if(busy)return;busy=true;try{const status=await command('default-browser-status');if(!status||status.error)return;choose.disabled=!status.supported;choose.hidden=status.isDefault;output.textContent=status.isDefault?'Nocturne открывает HTTP- и HTTPS-ссылки по умолчанию.':!status.supported?'Доступно после установки Nocturne для Windows.':status.http||status.https?'Часть ссылок уже открывается в Nocturne. Выбери его для HTTP и HTTPS.':'Выбери Nocturne, чтобы открывать ссылки из других программ.';}finally{busy=false;}}
 window.addEventListener('focus',refresh);document.querySelector('[data-section="general"]')?.addEventListener('click',refresh);refresh();
})();
