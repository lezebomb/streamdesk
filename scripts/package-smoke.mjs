import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {publicFile} from './public-files.mjs';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const clean=path.resolve('artifacts',`clean-checkout-${version}-${Date.now()}`);await fs.mkdir(clean,{recursive:true});
// Simulate a clean checkout: only tracked or non-ignored source files, plus this build.
// No local research, raw reports, private source config, npm cache or dependencies.
const files=execFileSync('git',['-c','core.excludesFile=.gitignore','ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){if(!publicFile(file))continue;const target=path.join(clean,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(file,target)}
await fs.cp('dist',path.join(clean,'dist'),{recursive:true});await fs.cp('runtime',path.join(clean,'runtime'),{recursive:true});await fs.mkdir(path.join(clean,'node_modules/hls.js'),{recursive:true});await fs.copyFile('node_modules/hls.js/LICENSE',path.join(clean,'node_modules/hls.js/LICENSE'));
execFileSync(process.execPath,['scripts/package.mjs'],{cwd:clean,stdio:'inherit',env:{...process.env,INCLUDE_EVIDENCE:'0'}});
const packaged=path.join(clean,'artifacts',`streamdesk-${version}`),manifest=JSON.parse(await fs.readFile(path.join(packaged,'PACKAGE_MANIFEST.json'),'utf8'));
assert.ok(manifest.files.some(f=>f.file.startsWith('dist/assets/')));assert.ok(manifest.files.some(f=>f.file==='shared/media-probe.ts'));assert.ok(manifest.files.every(f=>!f.file.startsWith('node_modules/')&&!/data\/sources\.json|\.jks$|\.env$|research\/upstream/.test(f.file)));
for(const f of manifest.files){assert.equal((await fs.stat(path.join(packaged,f.file))).size,f.bytes)}
const port=Number(process.env.PACKAGE_TEST_PORT||4186),server=spawn(process.execPath,['runtime/server.mjs'],{cwd:packaged,env:{...process.env,PORT:String(port),STREAMDESK_SOURCES:'data/quality-sources.json'},windowsHide:true,stdio:'pipe'});let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
try{const base=`http://127.0.0.1:${port}`;for(let n=0;n<30;n++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
const index=await (await fetch(base)).text(),asset=index.match(/src="([^\"]+\.js)"/)?.[1];assert.ok(asset);assert.equal((await fetch(new URL(asset,base+'/'))).status,200);const sources=await (await fetch(base+'/api/sources')).json();assert.ok(sources.sources.length>=3);const catalog=await (await fetch(base+'/api/search?q=Big%20Buck')).json();assert.ok(catalog.rows.some(r=>r.list.length));assert.ok(manifest.files.every(f=>publicFile(f.file)||f.file.startsWith('dist/')||f.file.startsWith('runtime/')));const report={at:new Date().toISOString(),ok:true,version,files:manifest.files.length,checks:['public files only','all manifest files exist','built asset served','bundled backend starts without npm runtime deps','catalog API returns actual metadata','private config and reports excluded'],log};await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/packaging-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{server.kill()}
