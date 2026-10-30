(() => {
 const card=document.createElement('div');card.id='app-updates';card.className='setting-card';card.append(text('h3','Обновления Nocturne'));
 const output=text('p','Новые версии доступны бесплатно через GitHub Releases.');output.id='app-update-status';output.setAttribute('role','status');
 const progress=document.createElement('progress');progress.id='app-update-progress';progress.hidden=true;progress.max=1;
 const check=button('Проверить обновления','Проверить новую версию Nocturne',()=>run('app-update-check'),'subtle');check.id='app-update-check';
 const download=button('Скачать обновление','Скачать новую версию Nocturne',()=>run('app-update-download'),'primary');download.id='app-update-download';download.hidden=true;
 const install=button('Установить и закрыть Nocturne','Запустить установщик обновления',()=>run('app-update-install'),'primary');install.id='app-update-install';install.hidden=true;
 const actions=document.createElement('div');actions.className='row-actions';actions.append(check,download,install);card.append(output,progress,actions,text('small','Скачанный установщик проверяется по SHA-256 и Microsoft Defender, если он доступен. Установка сохранит профиль. Перед запуском закрой другие окна Nocturne. Установщик пока без подписи издателя.'));$('about-section').children[1].after(card);
 let lastNotified='';
 function render(info){if(!info)return;const busy=['checking','downloading','scanning'].includes(info.stage);check.disabled=busy;download.disabled=busy;install.disabled=busy;download.hidden=!info.available||info.stage==='ready';install.hidden=info.stage!=='ready';progress.hidden=!['downloading','scanning'].includes(info.stage);progress.max=info.total||1;progress.value=info.received||0;
  const states={idle:'Установлена версия '+info.current+'.',checking:'Проверяем новые выпуски…',available:'Доступна версия '+info.latest+'.',current:'Установлена версия '+info.current+'. Более нового выпуска нет.',downloading:'Скачиваем обновление: '+Math.round((info.received||0)/Math.max(1,info.total)*100)+'%',scanning:'Проверяем установщик Microsoft Defender…',ready:'Обновление '+info.latest+' скачано и проверено по SHA-256.'};output.textContent=info.stage==='error'?info.error:states[info.stage]||'';
  if(info.available&&info.latest&&lastNotified!==info.latest&&info.stage==='available'){lastNotified=info.latest;if(typeof toast==='function')toast('Доступно обновление Nocturne '+info.latest);}
  if(info.stage==='ready'&&lastNotified!==info.latest+'-ready'){lastNotified=info.latest+'-ready';if(typeof toast==='function')toast('Обновление '+info.latest+' готово к установке');}
 }
 async function run(name){check.disabled=download.disabled=install.disabled=true;try{const result=await action(name);if(result?.error)output.textContent=result.error;}finally{render(await command('app-update-status'));}}
 api.onAppUpdate(render);command('app-update-status').then(render);
})();
