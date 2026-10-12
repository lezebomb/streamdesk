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
  async search(source,query,signal){if(!query)return [];const raw=await fetchJson(source,{ac:'videolist',wd:query,pg:'1'},signal);
   return parseSearchList(raw,shape(source)).filter(f=>isRelevant(f.name,query)&&!isAdultContent(f.typeName)).map(hit=>{const row=raw.list.find(r=>String(r.vod_id)===hit.vodId);if(!row)throw new Error('API 搜索结果缺少资源记录');const film=cmsFilm(row,source.id);return {...film,episodes:[],groups:undefined}});
  },
  async detail(source,id,signal){const raw=await fetchJson(source,{ac:'videolist',ids:id},signal),row=raw.list?.find(r=>String(r.vod_id)===id);if(!row)throw new Error('详情中没有请求的资源 ID');return cmsFilm(row,source.id)}
 };
}
