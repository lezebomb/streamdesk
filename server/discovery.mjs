import {poolMap} from '../shared/policy.ts';
import {adapters} from './adapters.mjs';
export async function browseSources(sources,category,page,signal,onRow,filters={}){
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(20000)]);
 return poolMap(sources.filter(s=>s.enabled&&s.type==='applecms').map((source,index)=>({source,index})),2,async({source,index})=>{
  const start=performance.now();let row;
  try{bounded.throwIfAborted();const result=await adapters.get(source.type).browse(source,category,page,bounded,{...filters,offset:index});row={sourceId:source.id,ok:true,ms:performance.now()-start,...result}}
  catch(e){row={sourceId:source.id,ok:false,ms:performance.now()-start,list:[],hasMore:page<3,error:e.message}}
  onRow(row);return row;
 });
}
