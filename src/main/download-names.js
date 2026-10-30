const path=require('node:path');
function safeFilename(value){
 let name=path.basename(value).replace(/[<>:"/\\|?*\x00-\x1f\u202a-\u202e\u2066-\u2069]/g,'_').replace(/[ .]+$/g,'');
 if(!name||name==='.'||name==='..')name='download';
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='download-'+name;
 return name;
}
function dangerousName(value){
 const normalized=value.replace(/[ .]+$/g,'');
 return /[\u202a-\u202e\u2066-\u2069]/.test(value)||/\.(exe|msi|msix|msixbundle|msixtheme|bat|cmd|com|ps1|psm1|psd1|vbs|vbe|vb|js|jse|wsf|wsh|scr|lnk|url|reg|hta|jar|cpl|dll|pif|msp|mst|scf|chm|iso|img|vhd|vhdx|appinstaller|application|gadget|sct|msc|diagcab|settingcontent-ms)$/i.test(normalized);
}
module.exports={safeFilename,dangerousName};
