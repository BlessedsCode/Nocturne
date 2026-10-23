const test=require('node:test'),assert=require('node:assert/strict');
const {liveContents,requestTab}=require('./tab-contents');
test('request ownership tolerates destroyed native views, missing contents and ownerless requests',()=>{
 const live={view:{webContents:{id:7,isDestroyed:()=>false}}};
 const dead={view:{webContents:{id:8,isDestroyed:()=>true}}};
 const detached={view:{get webContents(){return undefined;}}};
 const throwing={view:{get webContents(){throw Error('Object has been destroyed');}}};
 const staleID={view:{webContents:{get id(){throw Error('Object has been destroyed');},isDestroyed:()=>false}}};
 const tabs=[{view:null},detached,throwing,dead,staleID,live];
 assert.equal(requestTab(tabs,7),live);
 for(const id of [undefined,null,-1,0,8,99,'7'])assert.equal(requestTab(tabs,id),null);
 for(const tab of [null,dead,detached,throwing])assert.equal(liveContents(tab),null);
});
