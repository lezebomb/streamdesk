import type {Episode,Film,Source} from './model';
import type {CmsTransport,SourceAdapter} from './source-adapter';
import {seasonQuery} from './search-relevance.ts';
import {episodeIdentity} from './cms.ts';
import {validYear,validReleaseDate} from './metadata.ts';

// Observed on the provider's public /api/providers and Embed player, 2026-10-16.
// These are lanes of ONE service, not nine independent sources or verified 4K streams.
export const frameXProviders=[['auto','自动'],['miner','Miner XIX'],['headhunter','Headhunter XXXI'],['valkyrie','Valkyrie VI'],['hog_rider','Hog Rider XI'],['lavahound','Lava Hound XII'],['super_barbarian','Super Barbarian XVI'],['bowler','Bowler XVIII'],['titan','Titan VII'],['backup','Backup']] as const;
export const frameXApi='https://api.framextv.tech/api/search';
export function frameXRequestUrl(source:Source,params:Record<string,string>):URL {
 if(source.api!==frameXApi)throw Error('FrameXTV 元数据地址无效');
 const {_endpoint='search',...query}=params;
 if(!['search','details','season'].includes(_endpoint))throw Error('不支持的元数据接口');
 const u=new URL('/api/'+_endpoint,frameXApi);for(const [k,v]of Object.entries(query))u.searchParams.set(k,v);return u;
}
const idNumber=(value:unknown)=>/^\d{1,10}$/.test(String(value))&&Number(value)>0;
function parseId(value:string){const m=value.match(/^(movie|tv):(\d{1,10})(?::s([1-9]\d?))?$/);if(!m||!idNumber(m[2])||m[1]==='movie'&&m[3])throw Error('FrameXTV 影片标识无效');return {type:m[1] as 'movie'|'tv',id:m[2],season:m[3]?Number(m[3]):undefined}}
export function frameXEmbedUrl(id:string,season?:number,episode?:number,provider='auto',position=0):string {
 if(!idNumber(id)||season!==undefined&&(!Number.isInteger(season)||season<1||season>99)||season!==undefined&&(!Number.isInteger(episode)||episode!<1||episode!>1000)||!frameXProviders.some(p=>p[0]===provider))throw Error('嵌入参数无效');
 const u=new URL('https://framextv.xyz/embed/'+id+(season===undefined?'':`/${season}/${episode}`));u.searchParams.set('autoplay','1');if(provider!=='auto')u.searchParams.set('provider',provider);if(Number.isFinite(position)&&position>0)u.searchParams.set('t',String(Math.floor(position)));return u.href;
}
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const released=(value:unknown)=>!!validReleaseDate(value);
function shape(row:Record<string,unknown>,source:Source,season?:Record<string,unknown>):Film|undefined {
 const type=row.type,id=String(row.id),n=season?Number(season.number??season.season_number):undefined;
 if(!idNumber(id)||!['movie','tv'].includes(String(type))||!text(row.title)||season&&(!Number.isInteger(n)||n!<1||n!>99))return;
 const date=season?.air_date||row.release_date,year=validYear(season?text(date).slice(0,4):row.year);
 const genres=Array.isArray(row.genres)?row.genres:[],category=type==='movie'?'电影':genres.includes('Animation')?'动漫':'电视剧';
 return {id:`${type}:${id}${n?':s'+n:''}`,sourceId:source.id,canonicalId:`tmdb:${type}:${id}`,title:text(row.title)+(n?` 第${n}季`:''),season:n,category,year,poster:text(season?.poster)||text(row.poster)||text(row.image)||undefined,description:text(row.overview),releaseDate:validReleaseDate(date),releasePending:!!text(date)&&!released(date),episodes:[],contentKind:/\b(?:trailer|preview)\b/i.test(text(row.title))?'trailer':'regular'};
}
export function createFrameXAdapter(transport:CmsTransport):SourceAdapter {
 const get=async(s:Source,endpoint:string,params:Record<string,string>,signal:AbortSignal)=>{const r=await transport(s,{_endpoint:endpoint,...params},signal);if(r.success===false)throw Error('FrameXTV 元数据暂时不可用');return r};
 return {
  async search(s,q,signal){
   if(!q.trim())return [];const wanted=seasonQuery(q),query=wanted?.base||q;
   const raw=await get(s,'search',{q:query,type:'all',page:'1'},signal),rows=Array.isArray(raw.results)?raw.results.slice(0,30) as Record<string,unknown>[]:[],out:Film[]=[];
   // The API performs multilingual matching. Keep its hit context for relevance only;
   // never use a search string as a verified alias for automatic source matching.
   let tvDetails=0;
   for(const row of rows){const f=shape(row,s);if(!f)continue;f.matchedQuery=q;
    if(row.type==='tv'&&tvDetails<3){tvDetails++;try{const detail=await get(s,'details',{id:String(row.id),type:'tv'},signal);const seasons=Array.isArray(detail.seasons)?detail.seasons as Record<string,unknown>[]:[];for(const season of seasons){if(!released(season.air_date))continue;const film=shape(detail,s,season);if(film)out.push({...film,matchedQuery:q})}if(seasons.length)continue}catch(e){signal.throwIfAborted()}}
    out.push(f);
   }
   return out.sort((a,b)=>Number(b.season===wanted?.season)-Number(a.season===wanted?.season));
  },
  async detail(s,key,signal){
   const identity=parseId(key),raw=await get(s,'details',{id:identity.id,type:identity.type},signal);
   if(String(raw.id)!==identity.id||raw.type!==identity.type)throw Error('FrameXTV 详情身份不匹配');
   let season:Record<string,unknown>|undefined,eps:Record<string,unknown>[]=[];
   if(identity.type==='tv'){
    const seasons=(Array.isArray(raw.seasons)?raw.seasons:[]) as Record<string,unknown>[];
    const n=identity.season??Number(seasons.find(s=>Number(s.number??s.season_number)>0&&released(s.air_date))?.number);
    season=seasons.find(s=>Number(s.number??s.season_number)===n);if(!season||!released(season.air_date))throw Error('该季尚未播出或无法核实');
    const data=await get(s,'season',{id:identity.id,season:String(n)},signal);
    if(Number(data.number??data.season_number)!==n)throw Error('FrameXTV 返回了其他季');
    eps=(Array.isArray(data.episodes)?data.episodes:[]) as Record<string,unknown>[];
   }
   const f=shape(raw,s,season);if(!f)throw Error('FrameXTV 详情格式无效');if(f.releasePending)throw Error('本片尚未上映');
   const episodes:Episode[]=identity.type==='movie'?[{key:'feature',label:'正片',kind:'embed',url:frameXEmbedUrl(identity.id)}]:eps.filter(e=>idNumber(e.number??e.episode_number)&&released(e.air_date)&&(e.season_number===undefined||Number(e.season_number)===f.season)).map(e=>{const n=Number(e.number??e.episode_number),label=`第${n}集`;return {...episodeIdentity(label,f.season),label,kind:'embed',url:frameXEmbedUrl(identity.id,f.season,n)}});
   // The upstream automatic choice returned another episode during a TV check.
   // Start TV via Headhunter; retain explicit lanes without claiming correctness.
   f.groups=frameXProviders.map(([provider,name])=>({id:provider,name:provider==='auto'&&identity.type==='tv'?'推荐 · Headhunter XXXI':name,unsupported:0,episodes:episodes.map(e=>({...e,groupId:provider,url:frameXEmbedUrl(identity.id,e.season,e.number,provider==='auto'&&identity.type==='tv'?'headhunter':provider)}))}));f.episodes=f.groups[0].episodes;return f;
  }
 };
}

