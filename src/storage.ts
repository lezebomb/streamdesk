import type {Film,Episode,Health} from '../shared/model';
import {librarySnapshot,parseLibrary,filmIdentity,libraryMatches,persistedFilm,type History} from '../shared/library';
export type {History} from '../shared/library';
function read<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
export const store={
 favorites:read<Film[]>('sd:favorites',[]),history:read<History[]>('sd:history',[]),health:read<Record<string,Health>>('sd:health',{}),
 save(){try{const snapshot=this.export();localStorage.setItem('sd:library:v1',JSON.stringify(snapshot));localStorage.setItem('sd:favorites',JSON.stringify(snapshot.favorites));localStorage.setItem('sd:history',JSON.stringify(snapshot.history.slice(0,80)));localStorage.setItem('sd:health',JSON.stringify(this.health))}catch{/* Playback must survive quota / private-mode failures. */}},
 export(){return librarySnapshot(this.favorites,this.history)},
 import(raw:unknown){const next=parseLibrary(raw);const serialized=JSON.stringify(next);localStorage.setItem('sd:library:before-import',JSON.stringify(this.export()));localStorage.setItem('sd:library:v1',serialized);this.favorites=next.favorites;this.history=next.history;this.save()},
 identity:filmIdentity,matches:libraryMatches,
 favorite(f:Film){return this.favorites.some(x=>libraryMatches(x,f))},
 toggle(f:Film){this.favorites=this.favorite(f)?this.favorites.filter(x=>!libraryMatches(x,f)):[f,...this.favorites];this.save()},
 remember(f:Film,episodeKey:string,position:number,selected?:Episode){if(!Number.isFinite(position))return;this.history=[{film:persistedFilm(f,selected||f.episodes.find(e=>e.key===episodeKey)),episodeKey,position,at:Date.now()},...this.history.filter(x=>!libraryMatches(x.film,f))].slice(0,80);this.save()}
};
// Keep 0.1.0 keys as a migration fallback; updates never delete legacy records.
try{const raw=localStorage.getItem('sd:library:v1');if(raw){const snapshot=parseLibrary(JSON.parse(raw));store.favorites=snapshot.favorites;store.history=snapshot.history}}catch{/* Preserve legacy keys if a newer snapshot is damaged. */}
