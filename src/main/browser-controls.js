function shortcutFor(input){
 if(input.type!=='keyDown'||input.isComposing)return null;
 const code=input.code||'',key=String(input.key||'').toLowerCase(),letter=/^Key[A-Z]$/.test(code)?code.slice(3).toLowerCase():key;
 const ctrl=input.control||input.meta,shift=!!input.shift,alt=!!input.alt;
 if(!ctrl&&!alt&&!shift&&key==='f12')return input.isAutoRepeat?null:'devtools';
 if(!ctrl&&!alt&&!shift&&key==='f11')return input.isAutoRepeat?null:'fullscreen';
 if(!alt&&(key==='f5'||ctrl&&letter==='r'))return ctrl&&shift||key==='f5'&&ctrl?'hard-reload':'reload';
 if(!ctrl&&!alt&&key==='f3')return shift?'find-previous':'find-next';
 if(!ctrl&&!alt&&key==='f6')return 'address';
 if(alt&&!ctrl&&!shift){if(key==='arrowleft')return 'back';if(key==='arrowright')return 'forward';if(key==='home')return 'home';if(letter==='d')return 'address';}
 if(!ctrl||alt)return null;
 if(shift){const action={t:'reopen-tab',i:'devtools',j:'console',c:'inspect-picker',r:'hard-reload',delete:'privacy'}[letter];if(action)return action;}
 if(key==='tab'||code==='Tab')return shift?'previous-tab':'next-tab';
 if(key==='pageup')return 'previous-tab';if(key==='pagedown')return 'next-tab';
 if(!shift){const digit=/^Digit[1-9]$/.test(code)?code.slice(5):key;if(/^[1-9]$/.test(digit))return 'tab-'+digit;
  const action={l:'address',t:'new-tab',w:'close-tab',f:'find',j:'downloads',h:'history',d:'bookmark',p:'print',s:'save-page',u:'source'}[letter];if(action)return action;}
 if(key==='+'||key==='='||code==='NumpadAdd'||code==='Equal')return 'zoom-in';
 if(key==='-'||code==='Minus'||code==='NumpadSubtract')return 'zoom-out';if(key==='0'||code==='Digit0'||code==='Numpad0')return 'zoom-reset';
 return null;
}
function httpURL(value){try{return /^https?:$/.test(new URL(value).protocol);}catch{return false;}}
function selectionLink(url,text){if(!httpURL(url)||!text?.trim())return '';const parsed=new URL(url);parsed.hash=':~:text='+encodeURIComponent(text.trim().slice(0,1500));return parsed.href;}
function contextTemplate(params,actions){
 const items=[],flags=params.editFlags||{},editable=!!params.isEditable,password=params.formControlType==='input-password';
 const add=(id,label,click,enabled=true,accelerator)=>items.push({id,label,click,enabled,...(accelerator?{accelerator,registerAccelerator:false}:{})});
 const separator=()=>{if(items.length&&items.at(-1).type!=='separator')items.push({type:'separator'});};
 if(editable){
  for(const [method,label,flag,key] of [['undo','Отменить','canUndo','Ctrl+Z'],['redo','Повторить','canRedo','Ctrl+Y']])add(method,label,()=>actions.edit(method),!!flags[flag],key);
  separator();
  for(const [method,label,flag,key] of [['cut','Вырезать','canCut','Ctrl+X'],['copy','Копировать','canCopy','Ctrl+C'],['paste','Вставить','canPaste','Ctrl+V'],['pasteAndMatchStyle','Вставить без форматирования','canPaste','Ctrl+Shift+V'],['delete','Удалить','canDelete']])add(method,label,()=>actions.edit(method),!!flags[flag]&&(!password||!['copy','cut'].includes(method)),key);
  separator();add('select-all','Выделить всё',()=>actions.edit('selectAll'),!!flags.canSelectAll,'Ctrl+A');
  if(params.misspelledWord&&!password){separator();for(const word of (params.dictionarySuggestions||[]).slice(0,5))add('spelling-'+items.length,word,()=>actions.replaceWord(word));}
 }else if(params.selectionText?.trim()){
  add('copy','Копировать',()=>actions.edit('copy'),flags.canCopy!==false,'Ctrl+C');add('select-all','Выделить всё',()=>actions.edit('selectAll'),true,'Ctrl+A');
 }
 if(params.linkURL){
  separator();if(httpURL(params.linkURL)){add('open-link','Открыть ссылку в новой вкладке',()=>actions.openTab(params.linkURL));add('open-link-window','Открыть ссылку в новом окне',()=>actions.openWindow?actions.openWindow(params.linkURL):actions.openTab(params.linkURL));add('save-link','Сохранить ссылку как…',()=>actions.download(params.linkURL));}
  add('copy-link','Копировать адрес ссылки',()=>actions.copy(params.linkURL));
  if(params.linkText?.trim())add('copy-link-text','Копировать текст ссылки',()=>actions.copy(params.linkText.trim()));
 }
 if(params.mediaType==='image'){
  separator();if(httpURL(params.srcURL)){add('open-image','Открыть изображение в новой вкладке',()=>actions.openTab(params.srcURL));add('save-image','Сохранить изображение как…',()=>actions.download(params.srcURL));add('copy-image-url','Копировать адрес изображения',()=>actions.copy(params.srcURL));}
  if(params.hasImageContents)add('copy-image','Копировать изображение',()=>actions.copyImage(params.x,params.y));
 }
 const selected=!password?params.selectionText?.trim():'';
 if(selected){
  separator();const preview=selected.replace(/[\r\n\t]+/g,' ').slice(0,50).replace(/&/g,'&&');
  add('search-selection','Искать «'+preview+'» в '+actions.engineName,()=>actions.search(selected));
  add('translate-selection','Перевести выделенное на английский',()=>actions.translate(selected));
  const link=selectionLink(params.frameURL||params.pageURL,selected);if(link)add('copy-text-link','Копировать ссылку на выделение',()=>actions.copy(link));
 }
 if(!editable&&!selected&&!params.linkURL&&params.mediaType!=='image'){
  add('back','Назад',actions.back,actions.canBack,'Alt+Left');add('forward','Вперёд',actions.forward,actions.canForward,'Alt+Right');add('reload','Обновить',actions.reload,true,'Ctrl+R');
 }
 separator();add('print','Печать…',actions.print,true,'Ctrl+P');add('screenshot','Сохранить снимок страницы…',actions.screenshot);
 add('source','Исходный код страницы',actions.source,true,'Ctrl+U');separator();add('inspect','Исследовать элемент',()=>actions.inspect(params.x,params.y),true,'Ctrl+Shift+C');
 return items;
}
module.exports={shortcutFor,httpURL,selectionLink,contextTemplate};
