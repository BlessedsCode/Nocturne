function renderSecurityWarning(tab){
 const warning=tab?.security;document.body.classList.toggle('security-warning-open',!!warning);$('security-warning').hidden=!warning;if(!warning)return;
 $('warning-title').textContent=warning.kind==='http'?'Соединение не зашифровано':warning.kind==='cloud-unavailable'?'Проверка недоступна':'Переход заблокирован';
 try{$('warning-host').textContent=new URL(warning.url).hostname;}catch{$('warning-host').textContent='';}
 $('warning-message').textContent=warning.message;$('warning-http').hidden=warning.kind!=='http';$('warning-https').hidden=warning.kind!=='http';
}
async function openSecurity(){if($('settings').hidden)await panel('settings');selectSettingsSection('security');}
$('security-button').onclick=openSecurity;$('warning-settings').onclick=openSecurity;$('warning-home').onclick=()=>go('nocturne://home');
$('warning-https').onclick=()=>action('security-try-https');$('warning-http').onclick=()=>action('security-allow-http');
function renderSecurityStatus(status){
 if(status?.contentFilters){const ads=status.contentFilters.ads,sb=status.contentFilters.sponsors;$('adblock-status').textContent=(ads.enabled?(ads.ready?'Работает':'Правила недоступны'):'Отключён')+' · заблокировано: '+ads.blocked+(ads.updated?' · правила: '+new Date(ads.updated).toLocaleDateString('ru'):'')+(ads.error?' · '+ads.error:'');$('sponsorblock-status').textContent=(sb.enabled?'Включён':'Отключён')+' · пропущено интеграций: '+sb.skipped+(sb.error?' · API недоступен: '+sb.error:'');}
 if(!status)return;$('security-count').hidden=!status.blocked;$('security-count').textContent=status.blocked;$('security-blocked-count').textContent='За этот запуск: '+status.blocked;
 $('security-lists-status').textContent=Object.values(status.lists||{}).map(list=>`${list.name}: ${list.count.toLocaleString('ru')} доменов · ${list.updated?new Date(list.updated).toLocaleString('ru'):'список недоступен'}`).join('\n');
 $('security-update-error').textContent=status.updateError||'';$('update-security-lists').disabled=status.updating;
 if(status.defender)$('defender-status').textContent=status.defender.available?'Microsoft Defender найден. Результат каждой проверки показывается в загрузках.':'Microsoft Defender не найден. Проверка недоступна; файлы не будут отмечены проверенными.';
 const cloud=status.cloud;$('cloud-status').textContent=!cloud?.configured?'Ключ не настроен. Облачная защита не работает.':!cloud.enabled?'Ключ сохранён. Облачная проверка выключена.':cloud.status==='unavailable'?'Ошибка соединения с сервисом. Непроверенные переходы останавливаются. '+(cloud.error||''):cloud.status==='available'?'Облачная защита включена. Последний успешный ответ Google: '+new Date(cloud.checkedAt).toLocaleTimeString('ru'):'Облачная защита включена. Нажми «Проверить подключение», чтобы проверить доступ к API.';
 $('security-api-key').placeholder=cloud?.configured?'Ключ сохранён. Ввести новый…':'Ввести API-ключ';
 if(status.runtime)$('runtime-security-status').textContent='Electron '+status.runtime.version+' · '+(status.runtime.packaged?'Локальная сборка без подписи издателя':'Запуск из исходников');
 $('security-log').replaceChildren();for(const entry of status.log||[]){const row=document.createElement('div');row.className='security-log-row';row.append(text('strong',entry.host||'Адрес скрыт'),text('span',({tracker:'Трекер',malware:'Опасный домен',phishing:'Угроза Google',http:'HTTP-переход',popup:'Всплывающее окно','cloud-unavailable':'Облако недоступно'})[entry.kind]||entry.kind),text('time',new Date(entry.time).toLocaleTimeString('ru')));$('security-log').append(row);}
 $('tracking-exceptions').replaceChildren();for(const host of status.exceptions||[]){const row=document.createElement('div');row.className='exception-row';row.append(text('span',host),button('×','Удалить исключение',async()=>{await action('security-exception',{host,remove:true});loadSecurityState();}));$('tracking-exceptions').append(row);}
}
async function loadSecurityState(){const result=await action('security-status');if(result&&!result.error)renderSecurityStatus(result);}
$('update-adblock').onclick=async()=>{$('update-adblock').disabled=true;try{await action('adblock-update');await loadSecurityState();}finally{$('update-adblock').disabled=false;}};
for(const input of document.querySelectorAll('[data-browser-setting="adBlock"],[data-browser-setting="sponsorBlock"]')){const previous=input.onchange;input.onchange=async()=>{await previous();await loadSecurityState();};}
api?.onSecurityStatus(renderSecurityStatus);
$('update-security-lists').onclick=async()=>{$('update-security-lists').disabled=true;await action('security-update-lists');await loadSecurityState();};
$('save-security-key').onclick=async()=>{const key=$('security-api-key').value.trim();if(!key)return toast('Введи API-ключ');const result=await action('security-save-key',key);if(!result?.error){$('security-api-key').value='';toast('Ключ сохранён зашифрованным');loadSecurityState();}};
$('remove-security-key').onclick=async()=>{await action('security-save-key','');$('security-api-key').value='';loadSecurityState();};
$('tracking-exception-form').onsubmit=async event=>{event.preventDefault();const result=await action('security-exception',{host:$('tracking-exception-host').value});if(!result?.error){$('tracking-exception-host').value='';loadSecurityState();}};
$('check-runtime-version').onclick=async()=>{$('check-runtime-version').disabled=true;$('runtime-check-result').textContent='Проверка…';try{const result=await action('security-check-runtime');$('runtime-check-result').textContent=result?.error||`Установлен ${result.current}, актуальный стабильный ${result.latest}. `+(result.updateAvailable?'Доступна другая стабильная версия.':'Версия совпадает.');}finally{$('check-runtime-version').disabled=false;}};
for(const id of ['cloud-provider','cloud-protection']){const previous=$(id).onchange;$(id).onchange=async()=>{await previous();loadSecurityState();};}
async function testCloudConnection(enable){
 const output=$('cloud-test-result');output.dataset.state='pending';output.textContent='Проверяем доступ к Google…';$('connect-cloud').disabled=true;$('test-cloud').disabled=true;
 try{const result=await action('security-test-connection',{key:$('security-api-key').value.trim()||undefined,enable});if(result?.error){output.dataset.state='error';output.textContent=result.error;return;}output.dataset.state=result.ok?'success':'error';output.textContent=result.message+(result.ok&&enable?' Облачная защита включена.':'');if(result.ok)$('security-api-key').value='';await loadBrowserSettings();await loadSecurityState();}
 finally{$('connect-cloud').disabled=false;$('test-cloud').disabled=false;}
}
$('connect-cloud').onclick=()=>testCloudConnection(true);$('test-cloud').onclick=()=>testCloudConnection(false);
$('cloud-open-console').onclick=()=>action('security-open-help','console');$('cloud-open-guide').onclick=()=>action('security-open-help','guide');
renderSecurityWarning(state.tabs.find(t=>t.id===state.active));loadSecurityState();
