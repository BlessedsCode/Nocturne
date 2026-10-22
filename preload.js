const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('browser', {
  profile: process.argv.includes('--nocturne-profile=personal')?'personal':'main',
  onPasswordImportProgress: callback => ipcRenderer.on('password-import-progress',(_event,data)=>callback(data)),
  onCombinedSearch: callback => ipcRenderer.on('combined-search', (_event, data) => callback(data)),
  onSearchSourceClosed: callback => ipcRenderer.on('search-source-closed', (_event, data) => callback(data)),
  onBrowserAction: callback => ipcRenderer.on('browser-action', (_event, data) => callback(data)),
  onOverlayBackground: callback => ipcRenderer.on('overlay-background', (_event, data) => callback(data)),
  onFindResult: callback => ipcRenderer.on('page-find-result', (_event, data) => callback(data)),
  command: (action, value) => ipcRenderer.invoke('command', action, value),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onFocusAddress: callback => ipcRenderer.on('focus-address', callback),
  onDownloads: callback => ipcRenderer.on('downloads', (_event, list) => callback(list)),
  onOpenDownloads: callback => ipcRenderer.on('open-downloads', callback),
  onLinkAction: callback => ipcRenderer.on('link-action',(_event,value)=>callback(value)),
  onSecurityStatus: callback => ipcRenderer.on('security-status',(_event,value)=>callback(value))
});
