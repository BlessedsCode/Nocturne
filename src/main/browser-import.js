const fs=require('node:fs/promises'),path=require('node:path');
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const definitions=[
 {id:'chrome',name:'Google Chrome',exe:'chrome.exe',paths:[['LOCALAPPDATA','Google/Chrome/Application/chrome.exe'],['ProgramFiles','Google/Chrome/Application/chrome.exe'],['ProgramFiles(x86)','Google/Chrome/Application/chrome.exe']],page:'chrome://password-manager/settings',steps:'Google Password Manager → Настройки → Экспорт паролей → Скачать файл.'},
 {id:'edge',name:'Microsoft Edge',exe:'msedge.exe',paths:[['ProgramFiles(x86)','Microsoft/Edge/Application/msedge.exe'],['ProgramFiles','Microsoft/Edge/Application/msedge.exe'],['LOCALAPPDATA','Microsoft/Edge/Application/msedge.exe']],page:'edge://wallet/passwords',steps:'Пароли → меню ⋯ → Экспорт паролей. Если откроется Wallet, выбери раздел «Пароли».'},
 {id:'firefox',name:'Mozilla Firefox',exe:'firefox.exe',paths:[['ProgramFiles','Mozilla Firefox/firefox.exe'],['ProgramFiles(x86)','Mozilla Firefox/firefox.exe'],['LOCALAPPDATA','Mozilla Firefox/firefox.exe']],page:'about:logins',steps:'Меню ⋯ в менеджере паролей → Экспорт логинов / Экспорт паролей → CSV.'},
 {id:'zen',name:'Zen Browser',exe:'zen.exe',paths:[['ProgramFiles','Zen Browser/zen.exe'],['ProgramFiles','Zen Twilight/zen.exe'],['LOCALAPPDATA','Zen Browser/zen.exe'],['LOCALAPPDATA','Programs/Zen Browser/zen.exe'],['LOCALAPPDATA','zen/zen.exe'],['USERPROFILE','zen.exe']],page:'about:logins',steps:'В Zen откроется about:logins. Меню ⋯ справа вверху → Экспорт паролей → подтвердить экспорт → сохранить CSV. Затем вернись в Nocturne и выбери файл. Основной пароль, если установлен, вводится только в Zen.'},
 {id:'brave',name:'Brave',exe:'brave.exe',paths:[['LOCALAPPDATA','BraveSoftware/Brave-Browser/Application/brave.exe'],['ProgramFiles','BraveSoftware/Brave-Browser/Application/brave.exe'],['ProgramFiles(x86)','BraveSoftware/Brave-Browser/Application/brave.exe']],page:'brave://password-manager/settings',steps:'Менеджер паролей → Настройки → Экспорт паролей.'},
 {id:'vivaldi',name:'Vivaldi',exe:'vivaldi.exe',paths:[['LOCALAPPDATA','Vivaldi/Application/vivaldi.exe'],['ProgramFiles','Vivaldi/Application/vivaldi.exe']],page:'chrome://settings/passwords',steps:'Менеджер паролей → Настройки или меню ⋯ → Экспорт паролей.'},
 {id:'opera',name:'Opera',exe:'opera.exe',paths:[['LOCALAPPDATA','Programs/Opera/opera.exe'],['LOCALAPPDATA','Programs/Opera GX/opera.exe']],page:'opera://password-manager/settings',steps:'Менеджер паролей → Настройки или меню ⋯ → Экспорт паролей.'},
 {id:'yandex',name:'Яндекс Браузер',exe:'browser.exe',paths:[['LOCALAPPDATA','Yandex/YandexBrowser/Application/browser.exe']],page:'browser://passwords',steps:'Пароли и карты → Пароли → Настройки → Экспортировать пароли.'}
];
async function registryPaths(exe,env){
 if(!env.SystemRoot)return [];
 const command=path.join(env.SystemRoot,'System32','reg.exe'),keys=['HKCU','HKLM'];
 const results=await Promise.all(keys.map(async hive=>{try{const {stdout}=await run(command,['query',hive+'\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\'+exe,'/ve'],{windowsHide:true,timeout:2500,maxBuffer:16384});const match=stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+)/i);if(!match)return '';return match[1].trim().replace(/^"|"$/g,'').replace(/%([^%]+)%/g,(_,key)=>env[key]||'');}catch{return '';}}));
 return results.filter(Boolean);
}
async function discoverBrowsers({env=process.env,stat=fs.stat,registry=registryPaths}={}){
 const found=await Promise.all(definitions.map(async browser=>{
  const candidates=browser.paths.filter(([key])=>env[key]).map(([key,relative])=>path.join(env[key],relative));
  candidates.push(...await registry(browser.exe,env));
  for(const executable of [...new Set(candidates)]){
   if(path.basename(executable).toLowerCase()!==browser.exe)continue;
   try{if((await stat(executable)).isFile())return {...browser,executable};}catch{}
  }
  return null;
 }));return found.filter(Boolean);
}
async function openBrowserExport(id,{executable,launch=spawn}={}){
 const definition=definitions.find(browser=>browser.id===id);
 const browser=executable&&definition&&path.basename(executable).toLowerCase()===definition.exe?{...definition,executable}:(await discoverBrowsers()).find(browser=>browser.id===id);
 if(!browser)throw new Error('Браузер больше не найден. Обнови список или выбери CSV вручную.');
 // Only discovered, fixed executable paths and fixed internal manager URLs are launched.
 await new Promise((resolve,reject)=>{const child=launch(browser.executable,[browser.page],{windowsHide:true,stdio:'ignore'});child.once('spawn',resolve);child.once('error',reject);child.unref();});
 return {opened:true,name:browser.name,steps:browser.steps};
}
module.exports={discoverBrowsers,openBrowserExport,definitions};
