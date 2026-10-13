import {poolMap} from '../shared/policy.ts';
import {adapters} from './adapters.mjs';
import {filterFilms} from '../shared/discovery.ts';
export async function browseSources(sources,category,page,signal,onRow,filters={}){
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(12000)]),enabled=sources.filter(s=>s.enabled&&s.type==='applecms');
 const rows=new Map(enabled.map(s=>[s.id,{sourceId:s.id,ok:true,ms:0,list:[],hasMore:filters.cursors?.[s.id]!==0,nextPage:filters.cursors?.[s.id]??1}]));
 const chains=new Map(),failed=new Set();
 const tasks=Array.from({length:4},(_,round)=>enabled.map((source,index)=>({source,index,round}))).flat(),start=performance.now();
 await poolMap(tasks,3,async({source,index,round})=>{
  const previous=chains.get(source.id)||Promise.resolve();let release;const lock=new Promise(r=>release=r);chains.set(source.id,previous.then(()=>lock));await previous;
  try{
   const row=rows.get(source.id),enough=round>0&&filterFilms([...rows.values()].flatMap(r=>r.list),{category,genre:filters.genre||'全部',language:filters.language||'全部',year:filters.year||'全部',sort:filters.sort==='score'?'score':'latest'}).length>=72;
   if(!row.hasMore||failed.has(source.id)||bounded.aborted||enough)return;
   try{const result=await adapters.get(source.type).browse(source,category,row.nextPage,bounded,{...filters,offset:index});row.list.push(...result.list);row.hasMore=result.hasMore;row.nextPage=result.hasMore?row.nextPage+1:0;row.ms=performance.now()-start;onRow({sourceId:source.id,ok:true,ms:row.ms,...result,nextPage:row.nextPage})}
   catch(e){row.ok=false;row.error=e.message;row.hasMore=true;failed.add(source.id);onRow({sourceId:source.id,ok:false,ms:performance.now()-start,list:[],hasMore:true,nextPage:row.nextPage,error:e.message})}
  }finally{release()}
 });return [...rows.values()];
}
