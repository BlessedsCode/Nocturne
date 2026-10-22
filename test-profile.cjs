const fs=require('node:fs/promises'),path=require('node:path');
exports.launch=async(electron,options)=>{
 const argument=options.args.find(value=>value.startsWith('--user-data-dir='));
 if(!argument)throw new Error('Tests need an isolated profile.');
 const directory=path.resolve(argument.slice('--user-data-dir='.length));
 const relative=path.relative(path.resolve('artifacts'),directory);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Test profile must stay in artifacts.');
 await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'browser-settings.json');let settings={};
 try{settings=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
 await fs.writeFile(file,JSON.stringify({...settings,firstRunComplete:true}));
 return electron.launch(options);
};
