import type {Film,Episode} from '../shared/model';
import {poolMap} from '../shared/policy';
export interface SavedDownload {id:string;film:Film;episode:Episode;bytes:number;at:number}
const cacheName='streamdesk-downloads-v1',key='sd:downloads:v1',maxBytes=320*1024*1024;
export function downloads():SavedDownload[]{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}}
export async function removeDownload(id:string){const cache=await caches.open(cacheName);for(const req of await cache.keys())if(new URL(req.url).pathname.startsWith(`/offline/${id}/`))await cache.delete(req);localStorage.setItem(key,JSON.stringify(downloads().filter(d=>d.id!==id)))}
export async function saveDownload(film:Film,episode:Episode,progress:(s:string)=>void,signal:AbortSignal){
 if(!('caches'in window)||!navigator.serviceWorker.controller)throw Error('请在已安装或正式运行的页面中下载');
 if(episode.kind==='embed')throw Error('当前嵌入线路不支持下载');
 const internal=new AbortController();signal=AbortSignal.any([signal,internal.signal]);const id=crypto.randomUUID(),prefix=`/offline/${id}/`,cache=await caches.open(cacheName);let bytes=0;
 async function get(url:string,limit:number){const r=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),credentials:'omit'});if(!r.ok)throw Error(`下载失败 HTTP ${r.status}`);const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;for await(const b of r.body as unknown as AsyncIterable<Uint8Array<ArrayBuffer>>){size+=b.length;if(size>limit||bytes+size>maxBytes)throw Error('本集超过 320 MiB 下载上限');chunks.push(b)}if(bytes+size>maxBytes)throw Error('本集超过 320 MiB 下载上限');bytes+=size;return new Blob(chunks,{type:r.headers.get('Content-Type')||'application/octet-stream'})}
 try{
  let local=prefix+'video.mp4';
  if(episode.kind==='mp4'){progress('正在下载…');await cache.put(local,new Response(await get(episode.url,maxBytes)))}
  else{let url=episode.url,text='';for(let depth=0;depth<4;depth++){text=await (await get(url,2*1024*1024)).text();if(!text.trimStart().startsWith('#EXTM3U'))throw Error('来源没有返回有效视频清单');if(!text.includes('#EXT-X-STREAM-INF'))break;const rows=text.split(/\r?\n/),ref=rows.find((s,i)=>i>0&&rows[i-1].startsWith('#EXT-X-STREAM-INF')&&s&&!s.startsWith('#'));if(!ref)throw Error('缺少画质地址');url=new URL(ref,url).href}
   if(!text.includes('#EXT-X-ENDLIST')||/#EXT-X-BYTERANGE|#EXT-X-KEY:(?!.*METHOD=NONE)/.test(text))throw Error('当前线路的直播、加密或范围分片格式暂不支持下载');
   const jobs:{url:string;local:string}[]=[];const lines=text.split(/\r?\n/).map(line=>{if(line.startsWith('#EXT-X-MAP:'))return line.replace(/URI="([^"]+)"/,(_,ref)=>{const local=prefix+`init-${jobs.length}`;jobs.push({url:new URL(ref,url).href,local});return `URI="${local}"`});if(line.trim()&&!line.startsWith('#')){const local=prefix+`segment-${jobs.length}.ts`;jobs.push({url:new URL(line,url).href,local});return local}return line});
   if(!jobs.length||jobs.length>2000)throw Error('当前分片数量不支持离线下载');let finished=0;
   const results=await poolMap(jobs,2,async job=>{try{signal.throwIfAborted();await cache.put(job.local,new Response(await get(job.url,16*1024*1024)));progress(`下载 ${++finished}/${jobs.length}`);return null}catch(e){internal.abort(e);return e}});const failure=results.find(Boolean);if(failure)throw failure;signal.throwIfAborted();local=prefix+'index.m3u8';await cache.put(local,new Response(lines.join('\n'),{headers:{'Content-Type':'application/vnd.apple.mpegurl'}}));
  }
  const saved={id,film:{...film,groups:undefined,episodes:[]},episode:{...episode,url:new URL(local,location.origin).href},bytes,at:Date.now()};localStorage.setItem(key,JSON.stringify([saved,...downloads()]));progress('下载完成');return saved;
 }catch(e){await removeDownload(id);throw e}
}
