const {test}=require('node:test'),assert=require('node:assert/strict');
const {shortcutFor,contextTemplate,selectionLink}=require('./browser-controls');
test('browser shortcuts: Russian keyboard layout, modifiers, reload, tabs, devtools and native editing',()=>{
 const key=(key,options={})=>shortcutFor({type:'keyDown',key,...options});
 assert.equal(key('е',{code:'KeyT',control:true}),'new-tab');assert.equal(key('T',{control:true,shift:true}),'reopen-tab');
 assert.equal(key('F12'),'devtools');assert.equal(key('F12',{isAutoRepeat:true}),null);assert.equal(key('F5',{control:true}),'hard-reload');assert.equal(key('r',{control:true,shift:true}),'hard-reload');
 assert.equal(key('Tab',{control:true,shift:true}),'previous-tab');assert.equal(key('9',{control:true}),'tab-9');assert.equal(key('F3',{shift:true}),'find-previous');assert.equal(key('ArrowLeft',{alt:true}),'back');
 assert.equal(key('c',{control:true}),null);assert.equal(key('v',{control:true}),null);assert.equal(key('t',{control:true,alt:true}),null);assert.equal(key('t',{control:true,isComposing:true}),null);
});
test('context menu respects passwords and edit flags, supports selected text, links, images and inspect',()=>{
 const called=[];const actions=new Proxy({engineName:'Bing',canBack:false,canForward:true},{get:(target,key)=>key in target?target[key]:(...args)=>called.push([key,...args])});
 const items=contextTemplate({selectionText:'Touchpad & driver',pageURL:'https://example.com/',editFlags:{canCopy:true}},actions);
 items.find(item=>item.id==='search-selection').click();assert.deepEqual(called.pop(),['search','Touchpad & driver']);assert.match(items.find(item=>item.id==='search-selection').label,/Bing/);
 const link=selectionLink('https://example.com/path#old','one & two');assert.equal(new URL(link).hash,'#:~:text=one%20%26%20two');assert.equal(selectionLink('javascript:alert(1)','text'),'');
 const password=contextTemplate({isEditable:true,formControlType:'input-password',selectionText:'private',editFlags:{canCopy:true,canCut:true,canPaste:true}},actions);
 assert(!password.some(item=>item.id==='search-selection'||item.id==='translate-selection'));assert.equal(password.find(item=>item.id==='copy').enabled,false);assert.equal(password.find(item=>item.id==='paste').enabled,true);
 const image=contextTemplate({mediaType:'image',srcURL:'https://example.com/img.png',hasImageContents:true,x:5,y:9},actions);image.find(item=>item.id==='inspect').click();assert.deepEqual(called.pop(),['inspect',5,9]);assert(image.some(item=>item.id==='save-image'));
 const unsafe=contextTemplate({linkURL:'file:///C:/private.txt'},actions);assert(!unsafe.some(item=>item.id==='open-link'||item.id==='save-link'));
});
