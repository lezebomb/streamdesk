import type {Film,Health} from '../shared/model';
export interface History {film:Film;episodeKey:string;position:number;at:number}
function read<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
export const store={
 favorites:read<Film[]>('sd:favorites',[]),history:read<History[]>('sd:history',[]),health:read<Record<string,Health>>('sd:health',{}),
 save(){try{localStorage.setItem('sd:favorites',JSON.stringify(this.favorites));localStorage.setItem('sd:history',JSON.stringify(this.history.slice(0,80)));localStorage.setItem('sd:health',JSON.stringify(this.health))}catch{/* Playback must survive quota / private-mode failures. */}},
 identity(f:Film){return f.canonicalId||`${f.title}|${f.year||''}|${f.sourceId}`},
 favorite(f:Film){return this.favorites.some(x=>this.identity(x)===this.identity(f))},
 toggle(f:Film){this.favorites=this.favorite(f)?this.favorites.filter(x=>this.identity(x)!==this.identity(f)):[f,...this.favorites];this.save()},
 remember(f:Film,episodeKey:string,position:number){if(!Number.isFinite(position))return;this.history=[{film:f,episodeKey,position,at:Date.now()},...this.history.filter(x=>this.identity(x.film)!==this.identity(f))].slice(0,80);this.save()}
};
