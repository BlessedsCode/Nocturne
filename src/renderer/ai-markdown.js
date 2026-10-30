// Render model text with DOM nodes only: model HTML is never executed.
(() => {
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 function webURL(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
 function link(label,url){const href=webURL(url);if(!href)return node('span',label);const a=node('a',label);a.href=href;a.title=href;a.rel='noopener noreferrer';a.onclick=event=>{event.preventDefault();window.browser.command('open-tab',href);};a.onauxclick=event=>{if(event.button===1){event.preventDefault();window.browser.command('open-tab',href);}};return a;}
 function inline(parent,text,sources,depth=0,links=true){
  if(depth>8){parent.append(document.createTextNode(text));return;}
  let plain='';const flush=()=>{if(plain){parent.append(document.createTextNode(plain));plain='';}};
  for(let i=0;i<text.length;){
   if(text[i]==='\\'&&i+1<text.length&&/[\\`*_[\]{}()#+.!|>~-]/.test(text[i+1])){plain+=text[i+1];i+=2;continue;}
   if(text[i]==='`'){const run=text.slice(i).match(/^`+/)[0],end=text.indexOf(run,i+run.length);if(end>=0){flush();parent.append(node('code',text.slice(i+run.length,end)));i=end+run.length;continue;}}
   const rest=text.slice(i);
   if(links){
    const md=rest.match(/^\[([^\]\n]+)\]\(([^\s]*(?:\([^\s()]*\)[^\s()]*)?)(?:\s+"[^"]*")?\)/);
    if(md&&webURL(md[2])){flush();const a=link('',md[2]);inline(a,md[1],sources,depth+1,false);parent.append(a);i+=md[0].length;continue;}
    const citation=rest.match(/^\[(\d+(?:\s*,\s*\d+)*)\]/);
    if(citation){const ids=citation[1].split(',').map(Number);if(ids.every(id=>id>0&&sources[id-1]&&webURL(sources[id-1].url))){flush();const sup=node('sup');sup.className='ai-citation';for(const id of ids){const a=link('['+id+']',sources[id-1].url);a.setAttribute('aria-label','Источник '+id+': '+sources[id-1].title);sup.append(a);}parent.append(sup);i+=citation[0].length;continue;}}
    const auto=rest.match(/^(?:<)?https?:\/\/[^\s<>]+/);
    if(auto){let url=auto[0].replace(/^</,'').replace(/[.,;:!?]+$/,'');while(url.endsWith(')')&&(url.match(/\)/g)||[]).length>(url.match(/\(/g)||[]).length)url=url.slice(0,-1);if(webURL(url)){flush();parent.append(link(url,url));i+=(auto[0][0]==='<'?1:0)+url.length;if(auto[0][0]==='<'&&text[i]==='>')i++;continue;}}
   }
   let styled=false;
   for(const [mark,tag] of [['**','strong'],['__','strong'],['~~','del'],['*','em'],['_','em']]){
    if(rest.startsWith(mark)&&!/^\s/.test(rest.slice(mark.length))){const end=text.indexOf(mark,i+mark.length);if(end>i+mark.length){flush();const el=node(tag);inline(el,text.slice(i+mark.length,end),sources,depth+1,links);parent.append(el);i=end+mark.length;styled=true;break;}}
   }
   if(styled)continue;plain+=text[i++];
  }flush();
 }
 function cells(line){
  line=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'');const result=[];let value='',code=false;
  for(let i=0;i<line.length;i++){if(line[i]==='\\'&&line[i+1]==='|'){value+='|';i++;}else if(line[i]==='`'){code=!code;value+=line[i];}else if(line[i]==='|'&&!code){result.push(value.trim());value='';}else value+=line[i];}result.push(value.trim());return result;
 }
 const divider=line=>line.includes('|')&&cells(line).every(cell=>/^:?-{3,}:?$/.test(cell));
 const listItem=line=>line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
 function blocks(parent,lines,sources,depth=0){
  if(depth>10){parent.append(node('p',lines.join('\n')));return;}
  for(let i=0;i<lines.length;){const line=lines[i];if(!line.trim()){i++;continue;}
   const fence=line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)[^\n]*$/);
   if(fence){const content=[];i++;while(i<lines.length&&!new RegExp('^\\s*'+fence[1][0]+'{'+fence[1].length+',}\\s*$').test(lines[i]))content.push(lines[i++]);if(i<lines.length)i++;
    const wrap=node('div');wrap.className='ai-code-block';const toolbar=node('div');toolbar.className='ai-code-toolbar';const copy=node('button','Копировать');copy.type='button';copy.onclick=async()=>{try{const result=await window.browser.command('ai-copy',content.join('\n'));if(result?.error||result!==true)throw new Error('copy');copy.textContent='Скопировано';}catch{copy.textContent='Не удалось скопировать';}};toolbar.append(node('span',fence[2]||'Код'),copy);const pre=node('pre');pre.append(node('code',content.join('\n')));wrap.append(toolbar,pre);parent.append(wrap);continue;
   }
   if(i+1<lines.length&&line.includes('|')&&divider(lines[i+1])){
    const headings=cells(line),align=cells(lines[i+1]);const wrap=node('div');wrap.className='ai-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица ответа');const table=node('table'),thead=node('thead'),tr=node('tr');
    headings.forEach((value,col)=>{const th=node('th');th.scope='col';inline(th,value,sources);th.className=align[col]?.startsWith(':')&&align[col]?.endsWith(':')?'align-center':align[col]?.endsWith(':')?'align-right':'';tr.append(th);});thead.append(tr);table.append(thead);const body=node('tbody');i+=2;
    while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=node('tr'),values=cells(lines[i++]);headings.forEach((_value,col)=>{const td=node('td');td.className=tr.children[col].className;inline(td,values[col]||'',sources);row.append(td);});body.append(row);}table.append(body);wrap.append(table);parent.append(wrap);continue;
   }
   const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?$/);if(heading){const h=node('h'+Math.min(6,heading[1].length+1));inline(h,heading[2],sources);parent.append(h);i++;continue;}
   if(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){parent.append(node('hr'));i++;continue;}
   if(/^\s*>/.test(line)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*> ?/,''));const el=node('blockquote');blocks(el,quote,sources,depth+1);parent.append(el);continue;}
   const item=listItem(line);
   if(item){const indent=item[1].length,ordered=/\d/.test(item[2]),list=node(ordered?'ol':'ul');if(ordered)list.start=parseInt(item[2],10);
    while(i<lines.length){const next=listItem(lines[i]);if(!next||next[1].length!==indent||/\d/.test(next[2])!==ordered)break;const li=node('li');inline(li,next[3],sources);i++;const nested=[];while(i<lines.length&&lines[i].trim()&&/^\s+/.test(lines[i])&&(lines[i].match(/^\s*/)[0].length>indent))nested.push(lines[i++].slice(indent+2));if(nested.length)blocks(li,nested,sources,depth+1);list.append(li);}parent.append(list);continue;
   }
   const paragraph=node('p');inline(paragraph,line,sources);i++;
   while(i<lines.length&&lines[i].trim()&&!/^\s*(?:#{1,6}\s|>|`{3,}|~{3,})/.test(lines[i])&&!listItem(lines[i])&&!(i+1<lines.length&&divider(lines[i+1]))){paragraph.append(node('br'));inline(paragraph,lines[i++],sources);}
   parent.append(paragraph);
  }
 }
 window.aiSafeLink=link;
 window.renderAIAnswer=(text,sources=[])=>{const root=node('div');root.className='ai-markdown';blocks(root,String(text).slice(0,32000).replace(/\r\n?/g,'\n').split('\n'),sources);return root;};
})();
