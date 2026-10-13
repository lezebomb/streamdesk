import type {CmsTransport} from './source-adapter';
import type {Source} from './model';
export function cacheCmsTransport(transport:CmsTransport,options:{ttlMs?:number;maxEntries?:number;now?:()=>number}={}) {
 const memo=new Map<string,{expires:number;value:Awaited<ReturnType<CmsTransport>>}>(),now=options.now||Date.now,ttl=options.ttlMs??60000,max=options.maxEntries??300;
 const pending=new Map<string,{task:Promise<Awaited<ReturnType<CmsTransport>>>;controller:AbortController;users:number}>();
 const key=(source:Source,params:Record<string,string>)=>source.api+'?'+new URLSearchParams(Object.entries(params).sort()).toString();
 const put=(k:string,value:Awaited<ReturnType<CmsTransport>>,expires:number)=>{memo.set(k,{value,expires});while(memo.size>max)memo.delete(memo.keys().next().value!)};
 const fetch:CmsTransport=async(source,params,signal)=>{
  signal.throwIfAborted();const k=key(source,params),old=memo.get(k);if(old&&old.expires>now())return old.value;
  let shared=pending.get(k);if(!shared||shared.controller.signal.aborted){const controller=new AbortController();shared={controller,users:0,task:Promise.resolve({list:[]})};const owner=shared;
   owner.task=(async()=>{const raw=await transport(source,params,controller.signal);controller.signal.throwIfAborted();return raw})().finally(()=>{if(pending.get(k)===owner)pending.delete(k)});pending.set(k,owner);
  }
  shared.users++;const owner=shared;let abort:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason||new Error('请求已取消'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()});
  let raw:Awaited<ReturnType<CmsTransport>>;
  try{raw=await Promise.race([owner.task,cancelled]);signal.throwIfAborted()}finally{signal.removeEventListener('abort',abort);owner.users--;if(!owner.users)owner.controller.abort()}
  const expires=now()+(params.ac==='list'&&!params.wd?30*60000:ttl);put(k,raw,expires);
  // videolist already carries full playback data. Reuse verified response fields
  // for details, instead of downloading the same item again after a search click.
  if(params.wd)for(const row of raw.list||[])if(row.vod_id!==undefined&&typeof row.vod_play_url==='string'&&row.vod_play_url.length)put(key(source,{ac:'videolist',ids:String(row.vod_id)}),{list:[row]},expires);
  return raw;
 };
 return {fetch,clear:()=>memo.clear()};
}
