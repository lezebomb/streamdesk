import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('无效版本号');
const root=process.cwd(),stage=path.resolve('artifacts',`streamdesk-${version}`);
if(!stage.startsWith(root+path.sep))throw new Error('打包目录超出工作区');
try{await fs.stat(stage);throw new Error('打包目录已存在，保留原包；请使用新的版本目录')}catch(e){if(e.code!=='ENOENT')throw e}
// Fail before creating an incomplete stage if a runtime dependency is missing.
const dirs=['src','shared','server','public','dist','scripts','tests','docs','supabase','.github','LICENSES'];
const roots=['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','design-qa.md','README.md','LICENSE','THIRD_PARTY_NOTICES.md','Start-StreamDesk.cmd','.npmrc','.env.example','.gitignore'];
const data=['sources.example.json','cloud.example.json','candidates.json','acceptance-sources.json','acceptance-works.json','quality-sources.json','native-config.example.json','expansion-sources.json','expansion-verified.json','expansion-works.json','expansion-0.4-sources.json','expansion-0.4-works.json','expansion-0.5-sources.json'];
for(const f of [...dirs,...roots,...data.map(x=>'data/'+x),'node_modules/hls.js/LICENSE'])await fs.access(f);
await fs.mkdir(stage,{recursive:true});for(const dir of dirs)await fs.cp(dir,path.join(stage,dir),{recursive:true});
for(const f of roots)await fs.copyFile(f,path.join(stage,f));await fs.mkdir(path.join(stage,'data'));for(const f of data)await fs.copyFile(path.join('data',f),path.join(stage,'data',f));
await fs.copyFile('node_modules/hls.js/LICENSE',path.join(stage,'LICENSES/hls.js.txt'));
// Personal local archive only. Production / CI packaging keeps configuration out.
if(process.env.INCLUDE_CLOUD_CONFIG==='1'){const {cloudConfig}=await import('../server/cloud-config.mjs');const config=await cloudConfig();if(config.configured)await fs.writeFile(path.join(stage,'data/cloud.json'),JSON.stringify({url:config.url,publishableKey:config.publishableKey},null,2))}
await fs.mkdir(path.join(stage,'reports'));
const summaries=(await fs.readdir('reports',{withFileTypes:true})).filter(x=>x.isFile()&&/\.(?:md|json)$/.test(x.name));
const allowed=new Set(['performance.json','acceptance.json','reproducibility.json','coverage-summary.json','quality.json','abr.json','iteration-e2e.json','packaged-check.json','expansion-summary.json','enhancement-summary.json','packaging-summary.json','experience-summary.json','iteration-0.5-summary.json','mobile-0.5-summary.json']);
for(const f of summaries)if(f.name.endsWith('.md')||allowed.has(f.name))await fs.copyFile(path.join('reports',f.name),path.join(stage,'reports',f.name));
// Local evidence is optional and separate. GitHub packaging never depends on ignored files.
if(process.env.INCLUDE_EVIDENCE==='1')for(const dir of ['runs','evidence'])try{await fs.cp(path.join('reports',dir),path.join(stage,'reports',dir),{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e}
const manifest=[];async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())await walk(full);else{const bytes=await fs.readFile(full);manifest.push({file:path.relative(stage,full).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}}}
await walk(stage);await fs.writeFile(path.join(stage,'PACKAGE_MANIFEST.json'),JSON.stringify({version,createdAt:new Date().toISOString(),evidenceIncluded:process.env.INCLUDE_EVIDENCE==='1',files:manifest},null,2));console.log(JSON.stringify({stage,files:manifest.length,bytes:manifest.reduce((s,f)=>s+f.bytes,0)}));
