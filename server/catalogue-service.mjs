import {catalogueIndex} from './catalogue-index.mjs';import {metadataCatalogue} from './metadata-catalogue.mjs';
import {browseSources} from './discovery.mjs';import {sameFilm} from '../shared/policy.ts';import {searchAll,adapters} from './adapters.mjs';import {ratingMatch,attachRating} from '../shared/ratings.ts';
export function catalogueService({indexFile='data/catalogue-index.json',metadataFile='data/metadata-catalogue.json'}={}){
 const index=catalogueIndex(indexFile),metadata=metadataCatalogue(metadataFile);let lastWarm=0,warming;
 async function ingest(rows){await index.ingest(rows)}
 async function current(filters,sources){return index.query(filters,sources.filter(s=>s.enabled).map(s=>s.id),await metadata.all())}
 function warm(){if(warming)return warming;if(Date.now()-lastWarm<3600000)return;lastWarm=Date.now();warming=metadata.refresh().catch(()=>{}).finally(()=>warming=null);return warming}
 async function filmForRating(source,id,sources){if(source==='metadata')return metadata.cached(id);if(!sources.some(s=>s.enabled&&s.id===source))return;return index.find(source,id)}
 return {ingest,metadata,index,warm,async rating(source,id,sources,verify=false){
  const film=await filmForRating(source,id,sources);if(!film)return;
  const subjectId=film.canonicalId?.match(/^douban:(\d+)$/)?.[1];if(!subjectId)return;
  const meta=verify?await metadata.detail(subjectId):await metadata.cached(subjectId);
  return meta&&ratingMatch(film,meta)?attachRating(film,meta).doubanRating:undefined;
 },async browse(sources,filters,page,signal,receive){
  const selected={...filters,sort:filters.sort==='score'?'score':'latest'},existing=await current(selected,sources);
  // Directory transactions send one sorted snapshot; metadata refresh never holds them up.
  if(existing.length>=page*48){receive({sourceId:'catalogue-index',ok:true,ms:0,list:existing.slice((page-1)*48,page*48),hasMore:true});void warm();return}
  const start=performance.now(),rows=await browseSources(sources,filters.category,page,signal,()=>{},filters);await ingest(rows);const list=await current(selected,sources);
  receive({sourceId:'catalogue-index',ok:true,ms:performance.now()-start,list:list.slice((page-1)*48,page*48),hasMore:rows.some(r=>r.hasMore)||list.length>page*48});
  for(const row of rows)receive({...row,list:[]});void warm();
 },async resolve(id,sources,signal){
  // Playback uses cached identity. Rating fetches happen separately, never on this path.
  const meta=await metadata.cached(id);if(!meta)throw Error('影片目录暂时不可用');
  const matches=f=>sameFilm(f,meta)&&ratingMatch(f,meta),known=(await index.all()).filter(f=>matches(f)&&sources.some(s=>s.enabled&&s.id===f.sourceId));
  const rows=known.length?[]:await searchAll(sources,meta.title,signal);await ingest(rows);
  const hits=[...known,...rows.flatMap(r=>r.list)].filter(matches);
  for(const hit of hits.slice(0,5)){try{const source=sources.find(s=>s.id===hit.sourceId&&s.enabled);if(!source)continue;const f=await adapters.get(source.type).detail(source,hit.id,signal);if(f&&matches(f)&&f.episodes.length)return attachRating(f,meta)}catch{}}
  throw Error('暂时没有找到本片可用线路，请稍后重试')
 }};
}
