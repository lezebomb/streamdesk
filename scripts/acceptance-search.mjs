import fs from 'node:fs/promises';
import os from 'node:os';
import {adapters,searchAll} from '../server/adapters.mjs';
import {playbackGroups} from '../shared/cms.ts';
const sources=JSON.parse(await fs.readFile('data/acceptance-sources.json','utf8'));
const works=JSON.parse(await fs.readFile('data/acceptance-works.json','utf8'));
const runDir=process.env.RUN_DIR||'reports/runs/coverage-2026-10-12';await fs.mkdir(runDir,{recursive:true});
const report={at:new Date().toISOString(),environment:{os:os.platform(),node:process.version,apiConcurrency:2,mediaConcurrency:1,timeoutMs:8000,segmentByteLimit:10*1024*1024},sources,works:[]};
if(process.env.RESUME==='1')try{const previous=JSON.parse(await fs.readFile(`${runDir}/search-media.json`,'utf8'));report.works=previous.works;report.at=previous.at;report.resumedAt=new Date().toISOString()}catch{}
const normalize=s=>s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
async function download(url,limit=2*1024*1024){const start=performance.now(),r=await fetch(url,{signal:AbortSignal.timeout(8000)}),headersAt=performance.now(),chunks=[];let bytes=0,truncated=false;
 if(r.ok)for await(const b of r.body){bytes+=b.byteLength;chunks.push(b);if(bytes>limit){truncated=true;break}}
 else await r.body?.cancel();
 return {url:r.url,status:r.status,ttfbMs:headersAt-start,ms:performance.now()-start,bytes,truncated,body:Buffer.concat(chunks).toString('utf8')};
}
async function media(url,kind,evidence){const requests=[];try{
 let r=await download(url,kind==='mp4'?1024*1024:2*1024*1024);requests.push({...r,body:undefined});
 if(r.status>=400)return {ok:false,fault:r.status>=500?'source_server':'source_http',requests};
 if(kind==='mp4')return {ok:r.bytes>0,partial:true,requests};
 await fs.writeFile(evidence+'.m3u8',r.body);
 if(!r.body.startsWith('#EXTM3U'))return {ok:false,fault:'source_invalid_manifest',requests};
 if(/#EXT-X-KEY:.*(?:SAMPLE-AES|KEYFORMAT=)/.test(r.body))return {ok:false,fault:'protected_or_unsupported',requests};
 let lines=r.body.split(/\r?\n/);if(r.body.includes('#EXT-X-STREAM-INF')){
  const ref=lines.find((line,i)=>i>0&&lines[i-1].startsWith('#EXT-X-STREAM-INF')&&line&&!line.startsWith('#'));
  if(!ref)throw new Error('No variant URI');r=await download(new URL(ref,r.url).href);requests.push({...r,body:undefined});if(r.status>=400)return {ok:false,fault:'source_http',requests};lines=r.body.split(/\r?\n/);await fs.writeFile(evidence+'-variant.m3u8',r.body);
 }
 const ref=lines.find(x=>x.trim()&&!x.startsWith('#'));if(!ref)return {ok:false,fault:'source_empty_manifest',requests};
 const seg=await download(new URL(ref,r.url).href,10*1024*1024);requests.push({...seg,body:undefined});
 return {ok:seg.status<400&&seg.bytes>0,fault:seg.status>=400?'source_http':undefined,requests,segmentMbps:seg.bytes*8/seg.ms/1000};
 }catch(e){return {ok:false,fault:'network_or_source_unresolved',error:e.message,cause:e.cause?.code,requests}}}
for(const [index,work]of works.entries()){
 if(process.env.ONLY_TITLES&&!process.env.ONLY_TITLES.split(',').includes(work.title))continue;
 if(report.works.some(w=>w.index===index+1))continue;
 const row={...work,index:index+1,search:[],attempts:[]};const progress=[];
 const rows=await searchAll(sources,work.title,AbortSignal.timeout(23000),r=>progress.push({sourceId:r.sourceId,ms:r.ms,ok:r.ok}));
 row.search=rows.map(r=>({...r,list:r.list.map(({episodes,groups,...f})=>f)}));row.completionOrder=progress;
 for(const result of rows){const acceptable=new Set([work.title,...work.aliases||[]].map(normalize));const hits=result.list.filter(f=>acceptable.has(normalize(f.title))&&(!work.year||work.year===f.year)&&(!work.category||work.category===f.category));
  const hit=hits[0];if(!hit)continue;const s=sources.find(x=>x.id===result.sourceId);const attempt={sourceId:s.id,hit,groups:[]};row.attempts.push(attempt);
  try{const t=performance.now(),film=await adapters.get(s.type).detail(s,hit.id,AbortSignal.timeout(10000));attempt.detailMs=performance.now()-t;attempt.film=film;
   const seen=new Set();for(const g of playbackGroups(film)){const episode=g.episodes[0];if(!episode||seen.has(episode.url))continue;seen.add(episode.url);if(attempt.groups.length>=2)break;
    const evidence=`${runDir}/${index+1}-${s.id}-${attempt.groups.length+1}`;attempt.groups.push({groupId:g.id,name:g.name,episode,network:await media(episode.url,episode.kind,evidence)});
   }
  }catch(e){attempt.error=e.message;attempt.fault='api_or_network'}
 }
 report.works.push(row);await fs.writeFile(`${runDir}/search-media.json`,JSON.stringify(report,null,2));await fs.writeFile(`${runDir}/work-${index+1}.json`,JSON.stringify(row,null,2));
 console.log(JSON.stringify({work:work.title,exactHits:row.attempts.length,mediaGroups:row.attempts.flatMap(a=>a.groups).length,reachableGroups:row.attempts.flatMap(a=>a.groups).filter(g=>g.network.ok).length}));
}
console.log('SAVED '+runDir+'/search-media.json');
