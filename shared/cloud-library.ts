import type {Film} from './model';
import {filmIdentity,parseLibrary,type LibrarySnapshot} from './library.ts';
export interface CloudEntry {kind:'favorite'|'history';item_key:string;film:Film;episode_key?:string;position:number;updated_at:number;deleted:boolean}
export function cloudFilm(f:Film):Film {const {groups,episodes,description,matchedQuery,...metadata}=f;return {...metadata,episodes:[]}}
export function reconcileLibrary(previous:CloudEntry[],snapshot:LibrarySnapshot,now=Date.now()):CloudEntry[]{
 const entries=new Map(previous.map(e=>[e.kind+':'+e.item_key,e]));
 const items=[...snapshot.favorites.map(f=>({kind:'favorite' as const,film:f,position:0,at:now,episode_key:undefined})),...snapshot.history.map(h=>({kind:'history' as const,film:h.film,position:h.position,at:h.at,episode_key:h.episodeKey}))];
 const present=new Set<string>();
 for(const item of items){const item_key=filmIdentity(item.film),key=item.kind+':'+item_key,old=entries.get(key);present.add(key);
  if(old&&!old.deleted&&old.position===item.position&&old.episode_key===item.episode_key)continue;
  entries.set(key,{kind:item.kind,item_key,film:cloudFilm(item.film),position:item.position,episode_key:item.episode_key,updated_at:item.kind==='history'?item.at:now,deleted:false});
 }
 for(const [key,entry] of entries)if(!present.has(key)&&!entry.deleted)entries.set(key,{...entry,deleted:true,updated_at:now});
 return [...entries.values()].sort((a,b)=>b.updated_at-a.updated_at).slice(0,2000);
}
export function mergeEntries(local:CloudEntry[],remote:CloudEntry[]):CloudEntry[]{const map=new Map<string,CloudEntry>();for(const e of [...local,...remote]){const key=e.kind+':'+e.item_key,old=map.get(key);if(!old||e.updated_at>old.updated_at||e.updated_at===old.updated_at&&e.deleted)map.set(key,e)}return [...map.values()].sort((a,b)=>b.updated_at-a.updated_at).slice(0,2000)}
export function entriesSnapshot(entries:CloudEntry[]):LibrarySnapshot {return parseLibrary({favorites:entries.filter(e=>e.kind==='favorite'&&!e.deleted).map(e=>e.film),history:entries.filter(e=>e.kind==='history'&&!e.deleted&&e.episode_key).map(e=>({film:e.film,episodeKey:e.episode_key,position:e.position,at:e.updated_at}))})}
export function validEntry(raw:unknown):raw is CloudEntry {if(!raw||typeof raw!=='object')return false;const e=raw as CloudEntry;return ['favorite','history'].includes(e.kind)&&typeof e.item_key==='string'&&e.item_key.length<=512&&typeof e.deleted==='boolean'&&Number.isFinite(e.updated_at)&&Number.isFinite(e.position)&&e.position>=0&&!!e.film&&typeof e.film.title==='string'&&typeof e.film.id==='string'&&typeof e.film.sourceId==='string'&&Array.isArray(e.film.episodes)&&(!e.episode_key||typeof e.episode_key==='string')}
