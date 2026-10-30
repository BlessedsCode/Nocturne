const iconPaths={
 muted:'<path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
 'search-all':'<circle cx="10" cy="10" r="5.5"/><path d="m14 14 6 6M17 3h4v4M4 18v3h3"/>',
 move:'<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-9 3-3 3 3 3m3 3 3 3 3-3m3-9 3 3-3 3"/>',resize:'<path d="m9 19 10-10m-5 10 5-5"/>',
 back:'<path d="m14 6-6 6 6 6"/><path d="M8 12h12"/>',forward:'<path d="m10 6 6 6-6 6"/><path d="M4 12h12"/>',reload:'<path d="M20 6v6h-6"/><path d="M19.6 12a7.6 7.6 0 1 0-2 5.1"/>',
 settings:'<path d="m10 3-.7 2.1-2 .9-2.1-.4-2 3.4 1.4 1.7v2.6L3.2 15l2 3.4 2.1-.4 2 .9L10 21h4l.7-2.1 2-.9 2.1.4 2-3.4-1.4-1.7v-2.6L20.8 9l-2-3.4-2.1.4-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',
 home:'<path d="m4 10 8-7 8 7v10H4zM9 20v-7h6v7"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 download:'<path d="M12 4v12m-4-4 4 4 4-4M5 19h14"/>',shield:'<path d="m12 3 8 3v6c0 4.5-4.5 7.8-8 9-3.5-1.2-8-4.5-8-9V6z"/>',star:'<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',minus:'<path d="M5 12h14"/>',maximize:'<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',external:'<path d="M8 5H5v14h14v-3M13 3h8v8M10 14 21 3"/>',arrow:'<path d="M6 18 18 6M6 6h12v12"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',up:'<path d="m6 12 6-6 6 6M12 6v14"/>',down:'<path d="m6 12 6 6 6-6M12 18V4"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z"/>',
 tabs:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18m-12-5 3 5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',key:'<circle cx="8" cy="8" r="5"/><path d="m11.5 11.5 9 9M16 16l3-3m-6 0 3-3"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',palette:'<circle cx="8" cy="8" r=".8"/><circle cx="13" cy="6" r=".8"/><circle cx="17" cy="10" r=".8"/><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.6 1.6 0 0 1 1-2.8h2A4 4 0 0 0 21 11a9 9 0 0 0-9-8Z"/>'
};
function createIcon(name,className=''){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('fill',name==='star-filled'?'currentColor':'none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('icon');if(className)svg.classList.add(className);svg.innerHTML=iconPaths[name==='star-filled'?'star':name]||iconPaths.globe;return svg;
}
function setButtonIcon(el,name,className=''){
 for(const node of [...el.childNodes])if(node.nodeType===Node.TEXT_NODE||node.nodeName.toLowerCase()==='svg')node.remove();el.prepend(createIcon(name,className));el.classList.add('icon-button');
}
function decorateButton(el,value){const names={'×':'close','＋':'plus','↑':'up','↓':'down','✎':'edit','↗':'arrow'};if(names[value]){el.append(createIcon(names[value]));el.classList.add('icon-button');}else el.textContent=value;}
for(const [id,name] of Object.entries({'settings-button':'settings',home:'home','favorites-button':'heart','downloads-button':'download',back:'back',forward:'forward',reload:'reload',new:'plus',bookmark:'star','security-button':'shield','close-settings':'close','close-favorites':'close','close-links':'close','close-downloads':'close'})){const el=document.getElementById(id);if(el)setButtonIcon(el,name,id==='reload'?'reload-icon':'');}
document.querySelectorAll('.window button').forEach(el=>setButtonIcon(el,{minimize:'minus',maximize:'maximize',quit:'close'}[el.dataset.action]));
document.getElementById('protocol').replaceChildren(createIcon('globe'));
document.querySelector('#search-form>span').replaceChildren(createIcon('search'));
setButtonIcon(document.querySelector('#search-form>button'),'forward');
const sectionIcons={general:'home',appearance:'palette',tabs:'tabs',security:'shield',privacy:'lock',passwords:'key','download-settings':'download',history:'clock',shortcuts:'keyboard',about:'info'};
document.querySelectorAll('[data-section]').forEach(el=>el.querySelector('span')?.replaceChildren(createIcon(sectionIcons[el.dataset.section])));
document.querySelector('.warning-symbol')?.replaceChildren(createIcon('shield'));
