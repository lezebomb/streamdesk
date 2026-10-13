import {validYear,validReleaseDate} from './metadata.ts';
import type {Film} from './model';
import {sameFilm} from './policy.ts';
import {normalCatalogueEntry,recommendable,recommendationScore,normalizeLanguages} from './catalogue-policy.ts';
import {ratingMatch,ratingScore,ratingVotes,verifiedRating,attachRating} from './ratings.ts';
import {mergePosters} from './posters.ts';
export interface Filters {category:string;genre:string|string[];language:string;year:string;sort:'latest'|'score'}
export function selectedGenres(value:Filters['genre']):string[]{return [...new Set((Array.isArray(value)?value:value.split(',')).filter(x=>x&&x!=='全部'))]}
export function matchesFilters(f:Film,filters:Filters,now=Date.now()):boolean {
 if(!normalCatalogueEntry(f))return false;
 if(filters.category==='推荐'?!(recommendable(f)&&recentRelease(f,now)):f.category!==filters.category)return false;
 if(!selectedGenres(filters.genre).every(g=>f.genres?.includes(g)))return false;
 if(filters.language!=='全部'&&!normalizeLanguages(f.language||'').includes(filters.language))return false;
 if(filters.year!=='全部'&&(filters.year==='更早'?(!validYear(f.year,now)||Number(f.year)>=nowYear(now)-9):f.year!==filters.year))return false;
 return !f.releasePending;
}
export function releaseTime(f:Film,now=Date.now()):number {if(f.releasePending)return 0;if(f.releaseDate)return validReleaseDate(f.releaseDate,now)?Date.parse(f.releaseDate):0;return validYear(f.year,now)?Date.UTC(Number(f.year),0,1):0}
export function recentRelease(f:Film,now=Date.now()):boolean {const t=releaseTime(f,now);return !!t&&t<=now&&t>=now-365*86400000}
export function filterFilms(films:Film[],filters:Filters,now=Date.now()):Film[]{
 const seen:Film[]=[];
 for(const f of films){if(!matchesFilters(f,filters,now))continue;
  const i=seen.findIndex(x=>sameFilm(x,f)&&(!(x.sourceId==='metadata'||f.sourceId==='metadata')||ratingMatch(x,f)));if(i<0)seen.push(f);else {seen[i]=mergePosters(seen[i],f);if(verifiedRating(f))seen[i]=attachRating(seen[i],f)}
 }
 const stable=(a:Film,b:Film)=>a.title.localeCompare(b.title,'zh')||a.id.localeCompare(b.id);
 const sorted=seen.sort(filters.category==='推荐'?(a,b)=>recommendationScore(b,now)-recommendationScore(a,now)||stable(a,b):filters.sort==='score'?(a,b)=>Number(!!verifiedRating(b))-Number(!!verifiedRating(a))||ratingScore(b)-ratingScore(a)||ratingVotes(b)-ratingVotes(a)||releaseTime(b,now)-releaseTime(a,now)||stable(a,b):(a,b)=>releaseTime(b,now)-releaseTime(a,now)||(ratingVotes(b)||b.popularity||0)-(ratingVotes(a)||a.popularity||0)||stable(a,b));
 if(filters.category!=='推荐')return sorted;
 const buckets=['电影','电视剧','综艺','动漫'].map(c=>sorted.filter(f=>f.category===c)),out:Film[]=[];while(buckets.some(b=>b.length))for(const b of buckets)if(b.length)out.push(b.shift()!);return out;
}
function nowYear(now:number){return new Date(now).getFullYear()}
export {searchTerms} from './search-relevance.ts';
