import type {Film,Source} from './model';
import {cmsFilm,categoryOf} from './cms.ts';
import {searchTerms,relevance,normalizedTitle,seasonQuery} from './search-relevance.ts';
import {contentKind} from './catalogue-policy.ts';
import {parseSearchList,isAdultContent,isRelevant} from '../src/vendor/cms-parser.ts';

export interface SourceAdapter {search(source:Source,query:string,signal:AbortSignal):Promise<Film[]>;artwork?(source:Source,film:Film,signal:AbortSignal):Promise<Film[]>;detail(source:Source,id:string,signal:AbortSignal):Promise<Film|undefined>;browse?(source:Source,category:string,page:number,signal:AbortSignal,filters?:{genre?:string;language?:string;year?:string;offset?:number}):Promise<{list:Film[];hasMore:boolean}>}
export type CmsTransport=(source:Source,params:Record<string,string>,signal:AbortSignal)=>Promise<{list:Record<string,unknown>[]} & Record<string,unknown>>;
// Transport is supplied by Node DNS-guarded HTTP, Electron IPC or Capacitor native HTTP.
// The parser and identity rules have no Node runtime dependency.
export function createAppleCmsAdapter(fetchJson:CmsTransport):SourceAdapter {
 const shape=(source:Source)=>({key:source.id,name:source.name,url:source.api!});
 return {
  async artwork(source,film,signal){const raw=await fetchJson(source,{ac:'videolist',wd:film.title,pg:'1'},signal);return (raw.list||[]).filter(row=>!isAdultContent(String(row.type_name||''))).map(row=>({...cmsFilm(row,source.id),episodes:[],groups:undefined}))},
  async search(source,query,signal){
   if(!query)return [];const out:Film[]=[],terms=searchTerms(query);let requests=0;
   for(const term of terms){let pages=1;
    for(let page=1;page<=pages&&requests<3;page++){
     signal.throwIfAborted();const raw=await fetchJson(source,{ac:'videolist',wd:term,pg:String(page)},signal);requests++;pages=Math.min(3,Math.max(1,Number(raw.pagecount)||1));
     const found=parseSearchList(raw,shape(source)).filter(f=>!isAdultContent(f.typeName)).map(hit=>{const row=raw.list.find(r=>String(r.vod_id)===hit.vodId);if(!row)throw Error('API 搜索结果缺少资源记录');return {...cmsFilm(row,source.id),episodes:[],groups:undefined}}).filter(f=>relevance(f,query)>0||isRelevant(f.title,term));
     for(const film of found)if(!out.some(f=>f.id===film.id))out.push(film);
     const desired=seasonQuery(query);if(out.some(f=>normalizedTitle(f.title)===normalizedTitle(term)||desired&&relevance(f,query)>=1100))break;
     // Save the remaining request budget for alternate spellings if no result.
     if(!found.length&&terms.length>1)break;
    }
     if(requests>=3)break;
   }
   return out.sort((a,b)=>relevance(b,query)-relevance(a,query));
  },
  async browse(source,category,page,signal,filters={}){
   const taxonomy=await fetchJson(source,{ac:'list'},signal);
   const classes=Array.isArray(taxonomy.class)?taxonomy.class as {type_id:number;type_pid:number;type_name:string}[]:[];
   let leaves=classes.filter(c=>(category==='推荐'?['电影','电视剧','综艺','动漫'].includes(categoryOf(c.type_name)):categoryOf(c.type_name)===category)&&!isAdultContent(c.type_name)&&!classes.some(child=>child.type_pid===c.type_id)&&!['sports','short','ai','commentary','trailer'].includes(contentKind('',c.type_name)||''));
   if(category==='推荐'){
    leaves=leaves.filter(c=>categoryOf(c.type_name)!=='动漫'||/^(日本|日)动漫/.test(c.type_name));
    const buckets=['电影','电视剧','综艺','动漫'].map(type=>leaves.filter(c=>categoryOf(c.type_name)===type));leaves=[];
    while(buckets.some(b=>b.length))for(const b of buckets)if(b.length)leaves.push(b.shift()!);
   }
   // Genres/audio are metadata predicates; a region taxonomy is not proof of audio.
   const ids=leaves.map(c=>String(c.type_id));
   if(!ids.length)return {list:[],hasMore:false};
   const params:Record<string,string>={ac:'videolist',pg:String(Math.floor((page-1)/ids.length)+1),t:ids[(page-1+Math.max(0,Math.floor(filters.offset||0)))%ids.length]};
   if(source.supportsYear&&filters.year&&/^\d{4}$/.test(filters.year)&&Number(filters.year)<=new Date().getFullYear())params.year=filters.year;
   if(source.supportsYearRange&&filters.year==='更早')params.year=`1900-${new Date().getFullYear()-10}`;
   const raw=await fetchJson(source,params,signal);
   const list=(raw.list||[]).filter(row=>!isAdultContent(String(row.type_name||''))).map(row=>({...cmsFilm(row,source.id),episodes:[],groups:undefined}));
   return {list,hasMore:page<(Number(raw.pagecount)||1)*ids.length};
  },
  async detail(source,id,signal){const raw=await fetchJson(source,{ac:'videolist',ids:id},signal),row=raw.list?.find(r=>String(r.vod_id)===id);if(!row)throw new Error('详情中没有请求的资源 ID');return cmsFilm(row,source.id)}
 };
}
