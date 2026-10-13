import type {Film,Episode} from './model';
import {seasonOf,episodeIdentity,playbackGroups} from './cms.ts';
import {sameFilm,matchEpisode} from './policy.ts';
export interface History {film:Film;episodeKey:string;position:number;at:number}
export function historyEpisodeLabel(history:History):string {const saved=history.film.episodes.find(e=>e.key===history.episodeKey);if(saved)return saved.label;if(history.episodeKey==='feature')return '正片';if(history.episodeKey.startsWith('label:'))return history.episodeKey.slice(6);const number=history.episodeKey.match(/episode:(\d+)/)?.[1];return number?`${history.episodeKey.includes('edition:ova:')?'OVA ':history.episodeKey.includes('edition:special:')?'特别篇 ':''}第${number}集`:'继续观看'}
export interface LibrarySnapshot {app:'StreamDesk';schema:1;exportedAt:string;favorites:Film[];history:History[]}
export interface PersistencePort {read(key:string):Promise<string|null>;write(key:string,value:string):Promise<void>}
export function filmIdentity(f:Film){return `${f.canonicalId||f.title}|${f.year||''}|${f.season??seasonOf(f.title,f.category)??''}|${f.canonicalId?'':f.category||''}|${/解说/.test(f.title)?'commentary':/预告/.test(f.title)?'trailer':'feature'}`}
export function libraryMatches(a:Film,b:Film):boolean {
 if(sameFilm(a,b))return true;
 // 0.1.0 classified animation films as 动漫; the same canonical work may now be 电影.
 if(!a.canonicalId||a.canonicalId!==b.canonicalId||!['电影','动漫'].includes(a.category||'')||!['电影','动漫'].includes(b.category||''))return false;
 return sameFilm({...a,category:b.category},b);
}
export function resumeEpisode(history:History,film:Film):Episode|undefined {
 if(!libraryMatches(history.film,film))return undefined;const all=playbackGroups(film).flatMap(g=>g.episodes),season=history.film.season??seasonOf(history.film.title,history.film.category);
 const old=history.film.episodes.find(e=>e.key===history.episodeKey);
 if(old){const parsed=episodeIdentity(old.label,season),desired={...old,season:old.season??parsed.season,number:old.number??parsed.number,part:old.part??parsed.part,edition:old.edition??parsed.edition};const sameUrl=all.find(e=>e.url===old.url&&matchEpisode(desired,[e]));return sameUrl||matchEpisode(desired,all)}
 const exact=all.find(e=>e.key===history.episodeKey);if(exact)return exact;
 const legacy=history.episodeKey.match(/^episode:(\d+)$/);return legacy?all.find(e=>e.number===Number(legacy[1])&&e.season===season&&!e.part):undefined;
}
export function persistedFilm(film:Film,selected?:Episode):Film {const {groups:_groups,episodes:_episodes,...metadata}=film;return {...metadata,episodes:selected?[selected]:[]}}
export function librarySnapshot(favorites:Film[],history:History[]):LibrarySnapshot {return {app:'StreamDesk',schema:1,exportedAt:new Date().toISOString(),favorites:favorites.map(f=>persistedFilm(f)),history:history.map(h=>({...h,film:persistedFilm(h.film,playbackGroups(h.film).flatMap(g=>g.episodes).find(e=>e.key===h.episodeKey))}))}}
export function parseLibrary(raw:unknown):LibrarySnapshot {
 if(!raw||typeof raw!=='object')throw new Error('备份格式错误');const data=raw as Partial<LibrarySnapshot>;
 if(data.schema!==undefined&&(data.app!=='StreamDesk'||data.schema!==1))throw new Error('暂不支持此备份版本');
 const validFilm=(f:unknown):f is Film=>!!f&&typeof f==='object'&&typeof (f as Film).id==='string'&&typeof (f as Film).sourceId==='string'&&typeof (f as Film).title==='string'&&Array.isArray((f as Film).episodes);
 if(!Array.isArray(data.favorites)||data.favorites.length>2000||!data.favorites.every(validFilm)||!Array.isArray(data.history)||data.history.length>2000||!data.history.every(h=>h&&validFilm(h.film)&&typeof h.episodeKey==='string'&&Number.isFinite(h.position)&&h.position>=0&&Number.isFinite(h.at)))throw new Error('备份中包含无效收藏或历史记录');
 return librarySnapshot(data.favorites,data.history.slice(0,80));
}
