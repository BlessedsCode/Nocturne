// Runs only in an isolated world. No form values leave the renderer.
function watchEdits(){
 if(globalThis.__nocturneEditWatch)return;
 globalThis.__nocturneEditWatch=true;
 for(const event of ['input','change'])document.addEventListener(event,()=>{globalThis.__nocturneEdited=true;},true);
}
function hasDiscardRisk(){
 try{
  if(globalThis.__nocturneEdited)return true;
  // Closing a WebContents destroys its sessionStorage namespace. Do not lose tab-local auth/drafts.
  if(sessionStorage.length)return true;
  // Embedded editors, players and cross-origin call frames cannot be verified here.
  if(document.querySelector('iframe,frame,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return true;
  for(const media of document.querySelectorAll('video,audio')){
   if((!media.paused&&!media.ended)||(media.srcObject?.getTracks?.().some(track=>track.readyState==='live')))return true;
  }
  for(const el of document.querySelectorAll('input,textarea,select')){
   if(el.tagName==='SELECT'){if([...el.options].some(o=>o.selected!==o.defaultSelected))return true;continue;}
   if(['checkbox','radio'].includes(el.type)){if(el.checked!==el.defaultChecked)return true;continue;}
   if(el.type==='file'){if(el.files?.length)return true;continue;}
   if(['hidden','submit','button','reset'].includes(el.type))continue;
   if(el.value!==el.defaultValue||(el.type==='password'&&el.value))return true;
  }
  return false;
 }catch{return true;}
}
async function within(promise,ms=2000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Page inspection timed out')),ms);timer.unref?.();})]);}finally{clearTimeout(timer);}}
module.exports={watchEdits,hasDiscardRisk,within};
