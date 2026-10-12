import fs from 'node:fs/promises';
import os from 'node:os';
import {films} from '../server/catalog.mjs';
import {poolMap} from '../shared/policy.ts';
import {base} from './browser.mjs';
const requests=[];
async function request(url,{maxBytes=8*1024*1024,range,json=false}={}){
 const start=performance.now();let first=null,bytes=0,headersAt=null,status=null,finalUrl=url;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:range?{Range:range}:{}});headersAt=performance.now();status=r.status;finalUrl=r.url;
  if(!r.ok){await r.body?.cancel();throw new Error('HTTP '+r.status)}
  const chunks=[];for await(const chunk of r.body){if(first===null)first=performance.now();bytes+=chunk.byteLength;if(bytes>maxBytes)throw new Error('响应超过采样上限');chunks.push(Buffer.from(chunk))}
  const end=performance.now();const row={url,finalUrl,status,ok:true,range:range||null,bytes,headersMs:headersAt-start,firstByteMs:first===null?null:first-start,totalMs:end-start,mbps:bytes*8/(end-start)/1000,bodyMbps:first===null?null:bytes*8/Math.max(1,end-first)/1000,contentType:r.headers.get('content-type'),cors:r.headers.get('access-control-allow-origin'),contentRange:r.headers.get('content-range'),server:r.headers.get('server')};requests.push(row);
  return {row,body:Buffer.concat(chunks)};
 }catch(e){const row={url,finalUrl,status,ok:false,bytes,totalMs:performance.now()-start,error:e.message,headersMs:headersAt===null?null:headersAt-start};requests.push(row);return {row,body:null}}
}
async function hls(url){
 const manifests=[],segments=[];let current=url,body;
 for(let depth=0;depth<3;depth++){
  const r=await request(current,{maxBytes:512*1024});manifests.push(r.row);if(!r.body)return {manifests,segments};body=r.body.toString('utf8');if(!body.startsWith('#EXTM3U'))return {manifests,segments,error:'not HLS'};
  if(/#EXT-X-KEY:.*METHOD=(?!NONE)/.test(body))return {manifests,segments,error:'encrypted sample skipped'};
  const lines=body.split(/\r?\n/),variants=[];
  for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF')){const bandwidth=Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1]||0);const uri=lines.slice(i+1).find(l=>l.trim()&&!l.startsWith('#'));if(uri)variants.push({url:new URL(uri,current).href,bandwidth})}
  if(variants.length){variants.sort((a,b)=>a.bandwidth-b.bandwidth);const chosen=variants.find(v=>v.bandwidth>=600000)||variants[0];current=chosen.url;continue}break;
 }
 const uris=body.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>new URL(l.trim(),current).href);
 const indices=[0,1,Math.min(uris.length-1,8)];for(const i of [...new Set(indices)].filter(i=>i>=0&&uris[i]))segments.push((await request(uris[i])).row);
 return {manifests,segments,selectedPlaylist:current};
}
const at=new Date().toISOString(),api=[];
for(const f of films)for(const source of ['open-hls','open-mp4']){for(let round=1;round<=2;round++){const r=await request(`${base}/api/detail?source=${source}&id=${f.id}`,{maxBytes:512*1024});api.push({...r.row,film:f.id,source,round,scope:'local metadata endpoint; not an external catalog latency'});}}
const media=await poolMap(films,2,async f=>{
 const hr=await hls(f.hls),mr=[];for(const [start,end]of [[0,524287],[1048576,1572863]])mr.push((await request(f.mp4,{range:`bytes=${start}-${end}`,maxBytes:1024*1024})).row);
 return {film:f.id,hls:hr,mp4:mr};
});
const output={at,environment:{os:os.platform(),release:os.release(),node:process.version,concurrency:2,timeoutMs:15000,segmentCapBytes:8*1024*1024,rounds:2},api,media,requests};
await fs.writeFile('reports/network.json',JSON.stringify(output,null,2));console.log(JSON.stringify(media.map(m=>({film:m.film,hls:m.hls.segments.map(s=>({ok:s.ok,mbps:s.mbps,ms:s.totalMs})),mp4:m.mp4.map(s=>({ok:s.ok,status:s.status,mbps:s.mbps}))})),null,2));
