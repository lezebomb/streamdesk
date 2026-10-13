import fs from 'node:fs/promises';import path from 'node:path';
import {parseRankingHTML,parseSubjectHTML} from '../shared/metadata-html.ts';import {filterFilms} from '../shared/discovery.ts';import {networkSlot} from './network-pool.mjs';import {verifiedRating} from '../shared/ratings.ts';
export function metadataCatalogue(file,{transport=publicHTML,now=Date.now}={}){
 const records=new Map(),pending=new Map(),misses=new Map();let readyPromise,refreshPromise,writing=Promise.resolve(),refreshedAt=0,blockedUntil=0;
 const ready=()=>readyPromise??=(async()=>{try{const raw=JSON.parse(await fs.readFile(file,'utf8'));if(raw.schema===2){refreshedAt=raw.refreshedAt||0;for(const f of raw.films||[])if(f.sourceId==='metadata'&&/^\d+$/.test(f.id)&&f.metadataVerifiedAt)records.set(f.id,f)}}catch{}})();
 async function save(){const data=JSON.stringify({schema:2,refreshedAt,films:[...records.values()].slice(-20000)});writing=writing.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',data);await fs.rename(file+'.tmp',file)});await writing}
 const load=async url=>{if(blockedUntil>now())throw Error('目录站点暂时不可用');try{return await transport(url)}catch(e){if(/HTTP (?:403|429)|redirect/i.test(e.message))blockedUntil=now()+6*3600000;throw e}};
 async function cached(id){await ready();return records.get(id)}
 async function detail(id){await ready();if(!/^\d+$/.test(id))throw Error('作品 ID 无效');const old=records.get(id);
  if(old?.language&&verifiedRating(old)&&now()-(old.metadataVerifiedAt||0)<7*86400000||blockedUntil>now()||(misses.get(id)||0)>now())return old;
  if(!pending.has(id))pending.set(id,(async()=>{try{const f=parseSubjectHTML(await load('https://movie.douban.com/subject/'+id+'/'),id,now());if(f){records.set(id,f);await save();return f}misses.set(id,now()+6*3600000);return old}catch{misses.set(id,now()+3600000);return old}})().finally(()=>pending.delete(id)));return pending.get(id)
 }
 async function refresh(){await ready();if(refreshedAt&&now()-refreshedAt<24*3600000||blockedUntil>now())return;if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{let url='https://movie.douban.com/top250';const seen=new Set();
   for(let page=0;url&&page<10;page++){if(seen.has(url))break;seen.add(url);const r=parseRankingHTML(await load(url),url,now());if(!r.films.length){blockedUntil=now()+6*3600000;break}
    for(const f of r.films){const old=records.get(f.id);records.set(f.id,old?.language?{...old,doubanRating:f.doubanRating,metadataVerifiedAt:now()}:f)}await save();url=r.next;
   }
   refreshedAt=now();await save();
  })().finally(()=>refreshPromise=null);return refreshPromise;
 }
 return {refresh,detail,cached,async query(filters){await ready();return filterFilms([...records.values()],filters,now())},async all(){await ready();return [...records.values()]},get coverage(){return records.size}};
}
async function publicHTML(url){
 const u=new URL(url);if(u.origin!=='https://movie.douban.com'||!/^\/(?:top250|chart|subject\/\d+\/)\/?$/.test(u.pathname))throw Error('目录地址不允许');
 const signal=AbortSignal.timeout(9000);
 return networkSlot(async()=>{const r=await fetch(u,{redirect:'error',signal,headers:{Accept:'text/html'}});if(!r.ok)throw Error('目录 HTTP '+r.status);let data='',bytes=0;const decoder=new TextDecoder();for await(const b of r.body){bytes+=b.length;if(bytes>2*1024*1024)throw Error('目录响应过大');data+=decoder.decode(b,{stream:true})}return data+decoder.decode()},signal,{background:true});
}
