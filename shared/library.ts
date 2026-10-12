import type {Film} from './model';
export interface History {film:Film;episodeKey:string;position:number;at:number}
export interface LibrarySnapshot {app:'StreamDesk';schema:1;exportedAt:string;favorites:Film[];history:History[]}
export interface PersistencePort {read(key:string):Promise<string|null>;write(key:string,value:string):Promise<void>}
export function librarySnapshot(favorites:Film[],history:History[]):LibrarySnapshot {return {app:'StreamDesk',schema:1,exportedAt:new Date().toISOString(),favorites,history}}
export function parseLibrary(raw:unknown):LibrarySnapshot {
 if(!raw||typeof raw!=='object')throw new Error('备份格式错误');const data=raw as Partial<LibrarySnapshot>;
 if(data.schema!==undefined&&(data.app!=='StreamDesk'||data.schema!==1))throw new Error('暂不支持此备份版本');
 const validFilm=(f:unknown):f is Film=>!!f&&typeof f==='object'&&typeof (f as Film).id==='string'&&typeof (f as Film).sourceId==='string'&&typeof (f as Film).title==='string'&&Array.isArray((f as Film).episodes);
 if(!Array.isArray(data.favorites)||data.favorites.length>2000||!data.favorites.every(validFilm)||!Array.isArray(data.history)||data.history.length>2000||!data.history.every(h=>h&&validFilm(h.film)&&typeof h.episodeKey==='string'&&Number.isFinite(h.position)&&h.position>=0&&Number.isFinite(h.at)))throw new Error('备份中包含无效收藏或历史记录');
 return librarySnapshot(data.favorites,data.history.slice(0,80));
}
