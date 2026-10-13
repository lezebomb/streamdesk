import {rolldown} from 'rolldown';import fs from 'node:fs/promises';
await fs.mkdir('runtime',{recursive:true});
const bundle=await rolldown({input:'server/index.mjs',platform:'node',external:id=>id.startsWith('node:')||id==='vite'});
try{await bundle.write({file:'runtime/server.mjs',format:'esm',sourcemap:false})}finally{await bundle.close()}
const packages=['linkedom','css-select','css-what','boolbase','domutils','domhandler','domelementtype','dom-serializer','entities','htmlparser2','nth-check','uhyphen','cssom','html-escaper'];
for(const name of packages){const dir='node_modules/'+name,files=await fs.readdir(dir),license=files.find(s=>/^license(?:\.|$)/i.test(s));if(!license)throw Error('License missing: '+name);await fs.copyFile(dir+'/'+license,'LICENSES/'+name.replace('/','-')+'.txt')}
