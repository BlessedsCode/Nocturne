// A native WebContentsView can outlive its WebContents during tab teardown.
function liveContents(tab){
 try{const contents=tab?.view?.webContents;return contents&&!contents.isDestroyed()?contents:null;}catch{return null;}
}
function requestTab(tabs,id){
 if(!Number.isInteger(id)||id<=0)return null;
 for(const tab of tabs){const contents=liveContents(tab);try{if(contents&&contents.id===id)return tab;}catch{}}
 return null;
}
module.exports={liveContents,requestTab};
