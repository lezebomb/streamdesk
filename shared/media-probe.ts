import type {Episode} from './model';
export interface MediaProbe {ok:boolean;stage:'manifest'|'segment'|'unsupported'|'network';ms:number;ttfbMs?:number;bytes?:number;status?:number;mediaHost?:string;segmentHost?:string;width?:number;height?:number;bitrate?:number;error?:string;checkedAt:number}
// A bounded reachability check, never a claim that decoding or sustained playback succeeded.
export async function probeMedia(episode:Episode,signal:AbortSignal,transport:typeof fetch=fetch):Promise<MediaProbe>{
 const started=performance.now(),checkedAt=Date.now();let stage:MediaProbe['stage']='manifest',status:number|undefined,mediaHost:string|undefined;
 const finish=(extra:Partial<MediaProbe>):MediaProbe=>({ok:false,stage,ms:performance.now()-started,status,checkedAt,mediaHost,...extra});
 if(episode.kind==='embed')return finish({stage:'unsupported',error:'Embed 无法检查内部媒体'});
 async function read(url:string,limit:number){const at=performance.now();const r=await transport(url,{signal,credentials:'omit'});status=r.status;if(!r.ok){await r.body?.cancel();throw new Error(`HTTP ${r.status}`)}
  const reader=r.body!.getReader(),chunks:Uint8Array[]=[],ttfbMs=performance.now()-at;let bytes=0;try{while(bytes<limit){const {done,value}=await reader.read();if(done)break;const b=value.subarray(0,limit-bytes);chunks.push(b);bytes+=b.length}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const merged=new Uint8Array(bytes);let offset=0;for(const b of chunks){merged.set(b,offset);offset+=b.length}return {url:r.url||url,data:merged,bytes,ttfbMs};
 }
 try{
  signal.throwIfAborted();mediaHost=new URL(episode.url).hostname;
  if(episode.kind==='mp4'){stage='segment';const r=await read(episode.url,256*1024);const text=new TextDecoder().decode(r.data.subarray(0,80));return finish({ok:r.bytes>32&&!/^\s*(?:<!doctype|<html)/i.test(text),bytes:r.bytes,ttfbMs:r.ttfbMs,segmentHost:new URL(r.url).hostname})}
  let url=episode.url,width:number|undefined,height:number|undefined,bitrate:number|undefined;
  for(let depth=0;depth<4;depth++){
   const r=await read(url,512*1024),text=new TextDecoder().decode(r.data),lines=text.split(/\r?\n/).map(x=>x.trim());
   if(!text.trimStart().startsWith('#EXTM3U'))return finish({error:'无效 HLS 清单'});
   if(/#EXT-X-KEY:.*(?:SAMPLE-AES|KEYFORMAT=)/.test(text))return finish({stage:'unsupported',error:'受保护或不支持的媒体'});
   const variant=lines.findIndex(x=>x.startsWith('#EXT-X-STREAM-INF:'));
   if(variant>=0){const ref=lines.slice(variant+1).find(x=>x&&!x.startsWith('#'));if(!ref)throw new Error('缺少变体地址');const size=lines[variant].match(/RESOLUTION=(\d+)x(\d+)/);width=size?Number(size[1]):undefined;height=size?Number(size[2]):undefined;bitrate=Number(lines[variant].match(/(?:^|[:,])BANDWIDTH=(\d+)/)?.[1])||undefined;url=new URL(ref,r.url).href;continue}
   const ref=lines.find(x=>x&&!x.startsWith('#'));if(!ref)throw new Error('空媒体清单');
   // Verify fMP4 initialization too. A downloadable init alone is insufficient.
   const init=text.match(/#EXT-X-MAP:.*URI="([^"]+)"/);if(init)await read(new URL(init[1],r.url).href,128*1024);
   stage='segment';const seg=await read(new URL(ref,r.url).href,256*1024),head=new TextDecoder().decode(seg.data.subarray(0,80));
   return finish({ok:seg.bytes>=32&&!/^\s*(?:<!doctype|<html)/i.test(head),bytes:seg.bytes,ttfbMs:seg.ttfbMs,segmentHost:new URL(seg.url).hostname,width,height,bitrate});
  }return finish({error:'清单嵌套超出上限'});
 }catch(e){return finish({stage:status&&status>=400?stage:'network',error:e instanceof Error?e.message:String(e)})}
}
