import type {Film,Source} from './model';
import {cmsFilm} from './cms.ts';
import {parseSearchList,isAdultContent,isRelevant} from '../src/vendor/cms-parser.ts';

export interface SourceAdapter {search(source:Source,query:string,signal:AbortSignal):Promise<Film[]>;detail(source:Source,id:string,signal:AbortSignal):Promise<Film|undefined>}
export type CmsTransport=(source:Source,params:Record<string,string>,signal:AbortSignal)=>Promise<{list:Record<string,unknown>[]} & Record<string,unknown>>;
// Transport is supplied by Node DNS-guarded HTTP, Electron IPC or Capacitor native HTTP.
// The parser and identity rules have no Node runtime dependency.
export function createAppleCmsAdapter(fetchJson:CmsTransport):SourceAdapter {
 const shape=(source:Source)=>({key:source.id,name:source.name,url:source.api!});
 return {
  async search(source,query,signal){if(!query)return [];const normalize=(s:string)=>s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');let raw=await fetchJson(source,{ac:'videolist',wd:query,pg:'1'},signal);const out:Film[]=[];
   const pages=Math.min(3,Math.max(1,Number(raw.pagecount)||1));
   for(let page=1;page<=pages;page++){
    if(page>1){signal.throwIfAborted();raw=await fetchJson(source,{ac:'videolist',wd:query,pg:String(page)},signal)}
    const found=parseSearchList(raw,shape(source)).filter(f=>isRelevant(f.name,query)&&!isAdultContent(f.typeName)).map(hit=>{const row=raw.list.find(r=>String(r.vod_id)===hit.vodId);if(!row)throw new Error('API 搜索结果缺少资源记录');const film=cmsFilm(row,source.id);return {...film,episodes:[],groups:undefined}});
    for(const film of found)if(!out.some(f=>f.id===film.id))out.push(film);
    // Only continue when the first page lacks the requested literal title. Max 3
    // pages plus the caller's whole-search deadline avoid crawling broad catalogs.
    if(out.some(f=>normalize(f.title)===normalize(query)))break;
   }return out;
  },
  async detail(source,id,signal){const raw=await fetchJson(source,{ac:'videolist',ids:id},signal),row=raw.list?.find(r=>String(r.vod_id)===id);if(!row)throw new Error('详情中没有请求的资源 ID');return cmsFilm(row,source.id)}
 };
}
