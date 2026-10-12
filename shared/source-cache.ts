import type {CmsTransport} from './source-adapter';
import type {Source} from './model';
export function cacheCmsTransport(transport:CmsTransport,options:{ttlMs?:number;maxEntries?:number;now?:()=>number}={}) {
 const memo=new Map<string,{expires:number;value:Awaited<ReturnType<CmsTransport>>}>(),now=options.now||Date.now,ttl=options.ttlMs??60000,max=options.maxEntries??300;
 const key=(source:Source,params:Record<string,string>)=>source.api+'?'+new URLSearchParams(Object.entries(params).sort()).toString();
 const put=(k:string,value:Awaited<ReturnType<CmsTransport>>,expires:number)=>{memo.set(k,{value,expires});while(memo.size>max)memo.delete(memo.keys().next().value!)};
 const fetch:CmsTransport=async(source,params,signal)=>{
  signal.throwIfAborted();const k=key(source,params),old=memo.get(k);if(old&&old.expires>now())return old.value;
  const raw=await transport(source,params,signal);signal.throwIfAborted();const expires=now()+ttl;put(k,raw,expires);
  // videolist already carries full playback data. Reuse verified response fields
  // for details, instead of downloading the same item again after a search click.
  if(params.wd)for(const row of raw.list||[])if(row.vod_id!==undefined&&typeof row.vod_play_url==='string'&&row.vod_play_url.length)put(key(source,{ac:'videolist',ids:String(row.vod_id)}),{list:[row]},expires);
  return raw;
 };
 return {fetch,clear:()=>memo.clear()};
}
