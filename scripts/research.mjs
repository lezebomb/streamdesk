import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const evidence=[];
async function get(url,file){
  const start=performance.now();
  try { const r=await fetch(url,{signal:AbortSignal.timeout(20000)}); const text=await r.text();
    evidence.push({url,finalUrl:r.url,status:r.status,ms:performance.now()-start,bytes:Buffer.byteLength(text),headers:Object.fromEntries(r.headers)});
    if(file)await fs.writeFile(file,text);return text;
  }catch(e){evidence.push({url,ms:performance.now()-start,error:e.message,cause:e.cause?.code});return '';}
}
const html=await get('https://framextv.xyz/','research/framextv.html');
const scripts=[...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>m[1]).filter(s=>s.startsWith('/assets/'));
for(const [i,s] of scripts.entries()){
  const js=await get(new URL(s,'https://framextv.xyz').href,`research/framextv-app-${i}.js`);
  const terms=[...js.matchAll(/.{0,100}(?:\/embed\/|\/api\/|API Documentation|API Docs|postMessage|framextv\.|api-docs|\/docs|\/anime\/).{0,180}/g)].slice(0,65).map(m=>m[0]);
  console.log(JSON.stringify({script:s,terms},null,2));
}
await fs.writeFile('research/framextv-access.json',JSON.stringify({at:new Date().toISOString(),evidence},null,2));
