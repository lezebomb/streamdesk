import fs from 'node:fs/promises';import path from 'node:path';
import {filterFilms} from '../shared/discovery.ts';import {normalCatalogueEntry} from '../shared/catalogue-policy.ts';
import {ratingMatch,attachRating} from '../shared/ratings.ts';
export function catalogueIndex(file){const films=new Map();let readyPromise,writing=Promise.resolve();
 const ready=()=>readyPromise??=(async()=>{try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(data.schema===1)for(const f of data.films||[])films.set(f.sourceId+':'+f.id,f)}catch{}})();
 const strip=({groups,episodes,description,...f})=>({...f,episodes:[]});
 return {async ingest(rows){await ready();for(const row of rows)for(const f of row.list||[])if(normalCatalogueEntry(f))films.set(f.sourceId+':'+f.id,strip(f));while(films.size>30000)films.delete(films.keys().next().value);const data=JSON.stringify({schema:1,films:[...films.values()]});writing=writing.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',data);await fs.rename(file+'.tmp',file)});await writing},
 async query(filters,sourceIds,metadata=[]){await ready();const allowed=new Set(sourceIds),verified=new Map(metadata.filter(f=>f.metadataVerifiedAt).map(f=>[f.canonicalId,f]));const rows=[];
  for(const f of films.values())if(allowed.has(f.sourceId)){const m=verified.get(f.canonicalId);if(m&&f.year&&m.year&&f.year!==m.year)continue;rows.push(m&&ratingMatch(f,m)?attachRating({...f,genres:m.genres?.length?m.genres:f.genres,regions:m.regions?.length?m.regions:f.regions,releaseDate:m.releaseDate||f.releaseDate,metadataVerifiedAt:m.metadataVerifiedAt},m):f)}
  const enriched=metadata.map(m=>{const audio=rows.filter(f=>ratingMatch(f,m)).map(f=>f.language).filter(Boolean).join(',');return !m.language&&audio?{...m,language:audio}:m});
  return filterFilms([...rows,...enriched],filters)},async all(){await ready();return [...films.values()]},async find(source,id){await ready();return films.get(source+':'+id)}};
}
