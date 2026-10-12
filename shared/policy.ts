import type {Episode,Film,Health} from './model';
export function blankHealth():Health{return {apiSamples:0,apiFailures:0,apiMs:null,playSamples:0,playFailures:0,startupMs:null,mbps:null,stallMs:0,watchMs:0,cooldownUntil:0,failStreak:0,updatedAt:0}}
const ema=(old:number|null,n:number)=>old===null?n:old*.7+n*.3;
export function observe(h:Health,event:{kind:'api'|'play';ok:boolean;ms?:number;mbps?:number;stallMs?:number;watchMs?:number},now=Date.now()):Health{
 const n={...h,updatedAt:now};
 if(event.kind==='api'){n.apiSamples++;if(!event.ok)n.apiFailures++;if(event.ms!==undefined)n.apiMs=ema(n.apiMs,event.ms)}
 else {n.playSamples++;if(!event.ok)n.playFailures++;if(event.ms!==undefined)n.startupMs=ema(n.startupMs,event.ms);if(event.mbps!==undefined)n.mbps=ema(n.mbps,event.mbps);n.stallMs+=event.stallMs||0;n.watchMs+=event.watchMs||0;}
 // API and media failures stay separate; successful API calls cannot clear a media cooldown.
 if(event.kind==='play'){n.failStreak=event.ok?0:n.failStreak+1;if(event.ok)n.cooldownUntil=0;else if(n.failStreak>=2)n.cooldownUntil=now+Math.min(300000,30000*2**(n.failStreak-2));}
 return n;
}
export function healthScore(h:Health,now=Date.now()):number{
 if(h.cooldownUntil>now)return 0;
 const reliability=h.playSamples?1-h.playFailures/h.playSamples:.6;
 const api=h.apiSamples?1-h.apiFailures/h.apiSamples:.6;
 const startup=h.startupMs===null?.5:Math.max(0,1-h.startupMs/10000);
 const stall=h.watchMs?Math.max(0,1-h.stallMs/h.watchMs*5):.5;
 const bandwidth=h.mbps===null?.5:Math.min(1,h.mbps/8);
 return Math.round(45*reliability+10*api+15*startup+20*stall+10*bandwidth);
}
export function sameFilm(a:Film,b:Film):boolean{
 const edition=(title:string)=>/解说/.test(title)?'commentary':/预告/.test(title)?'trailer':'feature';
 if(edition(a.title)!==edition(b.title))return false;
 if(a.category&&b.category&&a.category!==b.category)return false;
 if(a.canonicalId&&b.canonicalId)return a.canonicalId===b.canonicalId;
 const normalize=(s:string)=>s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 return normalize(a.title)===normalize(b.title)&&!!a.year&&a.year===b.year&&a.category===b.category;
}
export function matchEpisode(current:Episode,candidates:Episode[]):Episode|undefined{
 const compatible=candidates.filter(e=>e.season===current.season);
 return compatible.find(e=>e.key===current.key)||compatible.find(e=>current.number!==undefined&&e.number===current.number)||compatible.find(e=>e.label.trim()===current.label.trim());
}
export async function poolMap<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]>{
 const out:R[]=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=cursor++;if(i>=items.length)return;out[i]=await fn(items[i])}}));return out;
}
