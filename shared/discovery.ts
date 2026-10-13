import {validYear,validReleaseDate} from './metadata.ts';
import type {Film} from './model';
import {sameFilm} from './policy.ts';
export interface Filters {category:string;genre:string;language:string;year:string;sort:'latest'|'score'}
export function releaseTime(f:Film,now=Date.now()):number {if(f.releasePending)return 0;if(f.releaseDate)return validReleaseDate(f.releaseDate,now)?Date.parse(f.releaseDate):0;return validYear(f.year,now)?Date.UTC(Number(f.year),0,1):0}
export function recentRelease(f:Film,now=Date.now()):boolean {const t=releaseTime(f,now);return !!t&&t<=now&&t>=now-365*86400000}
export function filterFilms(films:Film[],filters:Filters,now=Date.now()):Film[]{
 const seen:Film[]=[];
 for(const f of films){if(filters.category==='推荐'?!recentRelease(f,now):f.category!==filters.category)continue;
  if(filters.genre!=='全部'&&!f.genres?.includes(filters.genre))continue;
  if(filters.language!=='全部'&&!f.language?.includes(filters.language))continue;
  if(filters.year!=='全部'&&(filters.year==='更早'?(!validYear(f.year,now)||Number(f.year)>=nowYear(now)-9):f.year!==filters.year))continue;
  if(filters.sort==='score'&&!(f.doubanScore&&f.doubanScore>0))continue;
  const i=seen.findIndex(x=>sameFilm(x,f));if(i<0)seen.push(f);else if((f.doubanScore||0)>(seen[i].doubanScore||0))seen[i]={...seen[i],doubanScore:f.doubanScore};
 }
 return seen.sort(filters.sort==='score'?(a,b)=>(b.doubanScore||0)-(a.doubanScore||0)||releaseTime(b)-releaseTime(a):(a,b)=>releaseTime(b)-releaseTime(a)||(b.popularity||0)-(a.popularity||0));
}
function nowYear(now:number){return new Date(now).getFullYear()}
export {searchTerms} from './search-relevance.ts';
