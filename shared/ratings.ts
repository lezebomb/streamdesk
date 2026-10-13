import type {Film,DoubanRating} from './model';
import {normalizedTitle,seasonQuery} from './search-relevance.ts';
import {validYear} from './metadata.ts';

const scoreOK=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=10;
const titleKey=(s:string,category?:string)=>{const clean=s.replace(/\s*[（(]?(?:普通话|国语|粤语|国配)(?:版)?[）)]?\s*$/,'');return normalizedTitle(['电视剧','动漫'].includes(category||'')?seasonQuery(clean)?.base||clean:clean)};
const season=(f:Pick<Film,'title'|'category'|'season'>)=>f.season??(['电视剧','动漫'].includes(f.category||'')?seasonQuery(f.title)?.season:undefined);
// A claimed subject ID alone is never enough to verify a provider's title.
export function ratingMatch(a:Pick<Film,'title'|'year'|'category'|'season'|'canonicalId'>,b:Pick<Film,'title'|'year'|'category'|'season'|'canonicalId'>):boolean {
 if(!a.title||!b.title||!validYear(a.year)||!validYear(b.year)||a.year!==b.year||!a.category||a.category!==b.category)return false;
 if(!['电影','电视剧','动漫','综艺'].includes(a.category)||season(a)!==season(b))return false;
 if(a.canonicalId&&b.canonicalId&&a.canonicalId!==b.canonicalId)return false;
 return titleKey(a.title,a.category)===titleKey(b.title,b.category)&&!!titleKey(a.title,a.category);
}
export function verifiedRating(f:Film):DoubanRating|undefined {
 const r=f.doubanRating;if(!r||!scoreOK(r.score)||!/^\d+$/.test(r.subjectId)||!Number.isFinite(r.checkedAt)||r.checkedAt<=0)return;
 return ratingMatch(f,{...r.identity,canonicalId:'douban:'+r.subjectId})?r:undefined;
}
export function attachRating(f:Film,metadata:Film):Film {
 const rating=verifiedRating(metadata);return rating&&ratingMatch(f,metadata)?{...f,doubanRating:rating}:f;
}
export function displayRating(f:Film,now=Date.now()):{score:number;label:string;verified:boolean}|undefined {
 const verified=verifiedRating(f);if(verified){const day=new Date(verified.checkedAt).toISOString().slice(0,10);return {score:verified.score,verified:true,label:`豆瓣${now-verified.checkedAt>7*86400000?'缓存':''}评分 · 核对于 ${day}`}}
 const supplied=f.sourceRating;if(supplied&&scoreOK(supplied.score)&&validYear(f.year)&&f.category)return {score:supplied.score,verified:false,label:'片源提供的豆瓣评分 · 未核验'};
 // Older library backups remain readable, but can never become verified ratings.
 if(scoreOK(f.doubanScore)&&validYear(f.year)&&f.category)return {score:f.doubanScore,verified:false,label:'片源缓存评分 · 未核验'};
}
export const ratingScore=(f:Film)=>displayRating(f)?.score||0;
export const ratingVotes=(f:Film)=>verifiedRating(f)?.votes||0;
