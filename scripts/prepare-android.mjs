import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('android/app/src/main/assets');await fs.mkdir(root,{recursive:true});
if(process.env.STREAMDESK_PERSONAL_BUILD!=='1'){try{const entries=await fs.readdir(path.join(root,'private'));if(entries.length)throw Error('Public APK must use a clean checkout without private assets')}catch(e){if(e.code!=='ENOENT')throw e}}
// Vite filenames change per build; remove only the generated bundle directory.
await fs.rm(path.join(root,'assets'),{recursive:true,force:true});await fs.cp('dist',root,{recursive:true});
if(process.env.STREAMDESK_PERSONAL_BUILD==='1'){const target=path.join(root,'private');await fs.mkdir(target,{recursive:true});for(const name of ['sources.json','cloud.json','metadata-catalogue.json'])await fs.copyFile('data/'+name,path.join(target,name))}
console.log('Android assets prepared; personal configuration '+(process.env.STREAMDESK_PERSONAL_BUILD==='1'?'LOCAL ONLY':'excluded'));
