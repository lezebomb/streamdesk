import type {Film,Health} from '../shared/model';
import {librarySnapshot,parseLibrary,type History} from '../shared/library';
export type {History} from '../shared/library';
function read<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
export const store={
 favorites:read<Film[]>('sd:favorites',[]),history:read<History[]>('sd:history',[]),health:read<Record<string,Health>>('sd:health',{}),
 save(){try{localStorage.setItem('sd:library:v1',JSON.stringify(librarySnapshot(this.favorites,this.history)));localStorage.setItem('sd:favorites',JSON.stringify(this.favorites));localStorage.setItem('sd:history',JSON.stringify(this.history.slice(0,80)));localStorage.setItem('sd:health',JSON.stringify(this.health))}catch{/* Playback must survive quota / private-mode failures. */}},
 export(){return librarySnapshot(this.favorites,this.history)},
 import(raw:unknown){const next=parseLibrary(raw);const serialized=JSON.stringify(next);localStorage.setItem('sd:library:before-import',JSON.stringify(this.export()));localStorage.setItem('sd:library:v1',serialized);this.favorites=next.favorites;this.history=next.history;this.save()},
 identity(f:Film){return `${f.canonicalId||f.title}|${f.year||''}|${f.season||''}|${f.category||''}|${/解说/.test(f.title)?'commentary':/预告/.test(f.title)?'trailer':'feature'}`},
 favorite(f:Film){return this.favorites.some(x=>this.identity(x)===this.identity(f))},
 toggle(f:Film){this.favorites=this.favorite(f)?this.favorites.filter(x=>this.identity(x)!==this.identity(f)):[f,...this.favorites];this.save()},
 remember(f:Film,episodeKey:string,position:number){if(!Number.isFinite(position))return;this.history=[{film:f,episodeKey,position,at:Date.now()},...this.history.filter(x=>this.identity(x.film)!==this.identity(f))].slice(0,80);this.save()}
};
// Keep 0.1.0 keys as a migration fallback; updates never delete legacy records.
try{const raw=localStorage.getItem('sd:library:v1');if(raw){const snapshot=parseLibrary(JSON.parse(raw));store.favorites=snapshot.favorites;store.history=snapshot.history}}catch{/* Preserve legacy keys if a newer snapshot is damaged. */}
