import type {Film,Episode,PlaybackGroup} from './model';

export function chineseNumber(value:string):number|undefined {
 if(/^\d+$/.test(value))return Number(value);
 const digits='零一二三四五六七八九';
 if(value==='两')return 2;
 if(value.includes('十')){const [a,b]=value.split('十');const tens=a?digits.indexOf(a):1;const units=b?digits.indexOf(b):0;return tens>=0&&units>=0?tens*10+units:undefined}
 const n=digits.indexOf(value);return n>=0?n:undefined;
}
export function seasonOf(title:string,category?:string):number|undefined {
 const m=title.match(/第\s*([\d零一二三四五六七八九十两]+)\s*季/i)||title.match(/\b(?:season|s)\s*(\d+)\b/i);
 if(m)return chineseNumber(m[1]);
 // Chinese drama providers sometimes spell a season as 爱情公寓3.
 const suffix=category==='电视剧'?title.match(/^[^\d]+([1-9])$/):null;
 return suffix?Number(suffix[1]):undefined;
}
export function mediaKind(url:string):Episode['kind']|null {
 try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;const p=u.pathname.toLowerCase();return p.endsWith('.m3u8')?'hls':p.endsWith('.mp4')?'mp4':null}catch{return null}
}
export function categoryOf(value:string):string {return /动画片|动漫电影/.test(value)?'电影':/动漫|动画/.test(value)?'动漫':/片|电影/.test(value)?'电影':/剧/.test(value)?'电视剧':value}
export function episodeIdentity(label:string,season?:number):Pick<Episode,'key'|'number'|'season'|'part'> {
 const pair=label.match(/S(\d+)\s*E(\d+)/i)||label.match(/第\s*([\d零一二三四五六七八九十两]+)\s*季.*第\s*(\d+)\s*[集话話]/);
 const m=label.match(/(?:第\s*)?(\d+)\s*[集话話期]/)||label.match(/^(?:EP?|Episode\s*)?(\d{1,4})(?:[\s-]*(?:1080p|720p|4k))?$/i);
 const s=pair?chineseNumber(pair[1]):season,n=pair?Number(pair[2]):m?Number(m[1]):undefined;
 const part=label.match(/[集话話]\s*(上|下|前篇|后篇|後篇)/)?.[1];
 return {season:s,number:n,part,key:n===undefined?`label:${label.trim()}`:`${s===undefined?'':`season:${s}:`}episode:${n}${part?':part:'+part:''}`};
}
// Keep every group; page/opaque URLs remain diagnostic entries rather than guessed media.
export function cmsFilm(row:Record<string,unknown>,sourceId:string):Film {
 const title=String(row.vod_name||''),category=categoryOf(String(row.type_name||'')),season=seasonOf(title,category);
 const names=String(row.vod_play_from||'').split('$$$');
 const groups:PlaybackGroup[]=String(row.vod_play_url||'').split('$$$').map((raw,index)=>{
  const id=`group:${index}`,name=names[index]||`线路 ${index+1}`,parts=raw.split('#').filter(Boolean);let unsupported=0;
  const episodes=parts.flatMap((part,i)=>{const separator=part.indexOf('$');const label=separator<0?`第 ${i+1} 集`:part.slice(0,separator).trim();const url=(separator<0?part:part.slice(separator+1)).trim();const kind=mediaKind(url);if(!kind){unsupported++;return []}
   const identity=episodeIdentity(label,season);return [{...identity,key:category==='电影'&&parts.length===1?'feature':identity.key,label,url,kind,groupId:id}];});
  return {id,name,episodes,unsupported};
 });
 return {id:String(row.vod_id),sourceId,title,category,season,year:String(row.vod_year||'').match(/\d{4}/)?.[0],canonicalId:Number(row.vod_douban_id)>0?`douban:${row.vod_douban_id}`:undefined,poster:String(row.vod_pic||''),description:String(row.vod_content||'').replace(/<[^>]*>/g,''),groups,episodes:groups.find(g=>g.episodes.length)?.episodes||[]};
}
export function playbackGroups(film:Film):PlaybackGroup[] {return film.groups?.filter(g=>g.episodes.length)||[{id:'default',name:'默认线路',episodes:film.episodes,unsupported:0}]}
