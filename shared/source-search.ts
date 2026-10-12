import type {Source,SearchRow} from './model';
import type {SourceAdapter} from './source-adapter';
import {poolMap} from './policy.ts';

async function abortable<T>(task:Promise<T>,signal:AbortSignal):Promise<T>{
 let abort:()=>void=()=>{};
 const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason||new Error('搜索已取消'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true})});
 try{return await Promise.race([task,cancelled])}finally{signal.removeEventListener('abort',abort)}
}
export async function searchSources(sources:Source[],query:string,adapters:Map<string,SourceAdapter>,signal?:AbortSignal,onRow:(row:SearchRow)=>void=()=>{}):Promise<SearchRow[]> {
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(20000)].filter((s):s is AbortSignal=>!!s));
 return poolMap(sources.filter(s=>s.enabled&&(s.type!=='applecms'||query.trim())),2,async source=>{
  const start=performance.now();let row:SearchRow;
  try{bounded.throwIfAborted();const adapter=adapters.get(source.type);if(!adapter)throw new Error('来源适配器未注册');const list=await abortable(adapter.search(source,query,bounded),bounded);row={sourceId:source.id,ok:true,ms:performance.now()-start,list}}
  catch(error){row={sourceId:source.id,ok:false,ms:performance.now()-start,list:[],error:error instanceof Error?error.message:String(error)}}
  onRow(row);return row;
 });
}
