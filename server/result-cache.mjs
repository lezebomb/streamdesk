import fs from 'node:fs/promises';
import path from 'node:path';
import {filterFilms} from '../shared/discovery.ts';
// Bounded, local metadata cache. Media URLs / user libraries never enter it.
export function resultCache(file,{ttlMs=15*60000,maxEntries=128,now=Date.now}={}) {
 const entries=new Map();let loading,writing=Promise.resolve();
 const ready=()=>loading??=(async()=>{try{const raw=JSON.parse(await fs.readFile(file,'utf8'));if(raw.schema===1)for(const [k,v] of raw.entries||[])if(v.expires>now()&&Array.isArray(v.rows))entries.set(k,v)}catch{}})();
 const strip=rows=>rows.map(row=>({...row,list:row.list.map(({groups,episodes,description,...film})=>({...film,episodes:[]}))}));
 return {
  async get(key){await ready();const hit=entries.get(key);if(!hit||hit.expires<=now()){entries.delete(key);return}return structuredClone(hit.rows)},
  async query(filters,sourceIds,fingerprint){await ready();const enabled=new Set(sourceIds),films=new Map();for(const [key,value] of entries)if(value.expires>now()&&key.includes(fingerprint))for(const row of value.rows)for(const film of row.list)if(enabled.has(film.sourceId)){films.set(film.sourceId+':'+film.id,film);if(films.size>=8000)break}return filterFilms([...films.values()],filters).slice(0,144)},
  async put(key,rows){await ready();if(!rows.some(r=>r.ok&&r.list.length))return;entries.delete(key);entries.set(key,{expires:now()+(rows.some(r=>!r.ok)?Math.min(ttlMs,30000):ttlMs),rows:strip(rows)});while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
   const data=JSON.stringify({schema:1,entries:[...entries]});if(Buffer.byteLength(data)>16*1024*1024)return;
   writing=writing.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',data);await fs.rename(file+'.tmp',file)});await writing;
  }
 };
}
