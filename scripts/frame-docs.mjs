import fs from 'node:fs/promises';
const js=await fs.readFile('research/framextv-app-0.js','utf8');
const assets=[...new Set([...js.matchAll(/["'`]([^"'`]+\.js)["'`]/gi)].map(m=>m[1]).filter(x=>/DocsPage/i.test(x)&&x.startsWith('assets/')))];
console.log({assets});
const evidence=[];
for (const asset of assets){const url=new URL(asset.startsWith('/')?asset:'/'+asset.replace(/^\.\//,''),'https://framextv.xyz').href;try{
 const start=performance.now(),r=await fetch(url,{signal:AbortSignal.timeout(15000)}),body=await r.text();
 evidence.push({url,status:r.status,ms:performance.now()-start});await fs.writeFile('research/framextv-docs.js',body);
 console.log(body.slice(0,250));
 for(const term of ['embed','postMessage','api/','Endpoint','API','startAt','autoplay','progress','origin']){const hits=[];let at=0;for(let i=0;i<5;i++){at=body.indexOf(term,at);if(at<0)break;hits.push(body.slice(Math.max(0,at-80),at+260));at+=term.length}console.log(JSON.stringify({term,hits}))}
}catch(e){evidence.push({url,error:e.message})}}
await fs.writeFile('research/framextv-docs-access.json',JSON.stringify(evidence,null,2));
const page=await fetch('https://test-streams.mux.dev/',{signal:AbortSignal.timeout(15000)}).then(r=>r.text());
await fs.writeFile('research/test-streams.html',page);console.log([...page.matchAll(/href=["']([^"']+)/g)].map(m=>m[1]));
