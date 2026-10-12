import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('无效版本号');
const root=process.cwd(),stage=path.resolve('artifacts',`streamdesk-${version}`);
if(!stage.startsWith(root+path.sep))throw new Error('打包目录超出工作区');
try{await fs.stat(stage);throw new Error('打包目录已存在，保留原包；请使用新的版本目录')}catch(e){if(e.code!=='ENOENT')throw e}
await fs.mkdir(stage,{recursive:true});
for(const directory of ['src','shared','server','public','dist','scripts','tests','reports'])await fs.cp(directory,path.join(stage,directory),{recursive:true});
for(const file of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','README.md','LICENSE','THIRD_PARTY_NOTICES.md','Start-StreamDesk.cmd','.npmrc','.env.example','.gitignore'])await fs.copyFile(file,path.join(stage,file));
await fs.mkdir(path.join(stage,'data'));for(const file of ['sources.example.json','candidates.json','acceptance-sources.json','acceptance-works.json','quality-sources.json'])await fs.copyFile(path.join('data',file),path.join(stage,'data',file));
await fs.cp('LICENSES',path.join(stage,'LICENSES'),{recursive:true});await fs.copyFile('node_modules/hls.js/LICENSE',path.join(stage,'LICENSES','hls.js.txt'));
await fs.mkdir(path.join(stage,'research'));
// Keep reproducible HTTP evidence and media metrics. Do not redistribute full third-party website bundles.
const redact=(value)=>{
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value)){if(['body','raw','text','description'].includes(k))continue;out[k]=redact(v)}return out}
 return value;
};
for(const file of (await fs.readdir('research')).filter(f=>f.endsWith('.json'))){const data=JSON.parse(await fs.readFile(path.join('research',file),'utf8'));await fs.writeFile(path.join(stage,'research',file),JSON.stringify(redact(data),null,2));}
// Metadata plots/synopses are not needed to audit media timings.
for(const file of ['provider-media.json','provider-recent-media.json']){const p=path.join(stage,'reports',file);await fs.writeFile(p,JSON.stringify(redact(JSON.parse(await fs.readFile(p,'utf8'))),null,2));}
const manifest=[];async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())await walk(full);else{const bytes=await fs.readFile(full);manifest.push({file:path.relative(stage,full).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}}}
await walk(stage);await fs.writeFile(path.join(stage,'PACKAGE_MANIFEST.json'),JSON.stringify({version,createdAt:new Date().toISOString(),files:manifest},null,2));console.log(JSON.stringify({stage,files:manifest.length,bytes:manifest.reduce((s,f)=>s+f.bytes,0)}));
