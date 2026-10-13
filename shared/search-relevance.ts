import type {Film} from './model';
export const normalizedTitle=(s:string)=>s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function numberOf(s:string):number|undefined{if(/^\d+$/.test(s))return Number(s);const digits='零一二三四五六七八九';if(s==='两')return 2;const [t,u]=s.split('十');if(s.includes('十'))return (t?digits.indexOf(t):1)*10+(u?digits.indexOf(u):0);const n=digits.indexOf(s);return n>=0?n:undefined}
function chinese(n:number):string{const d='零一二三四五六七八九';return n<10?d[n]:`${n>=20?d[Math.floor(n/10)]:''}十${n%10?d[n%10]:''}`}
export function seasonQuery(q:string):{base:string;season:number}|undefined{
 const explicit=q.match(/^(.*?)\s*第\s*([\d零一二三四五六七八九十两]+)\s*季\s*$/)||q.match(/^(.*?)\s*(?:season\s*|s)(\d{1,2})\s*$/i);
 const shorthand=q.match(/^(.*[\p{L}])\s*(\d{1,2})\s*$/u);const match=explicit||shorthand;if(!match)return;const n=numberOf(match[2]),base=match[1].trim();return n&&n<=99&&normalizedTitle(base).length>=2?{base,season:n}:undefined;
}
const aliases=['我们怎么可能成为恋人不行不行','我怎么可能成为你的恋人不行不行','我们不可能成为恋人','我怎么能成为你的恋人不行不行'];
export function searchTerms(q:string):string[]{
 if(aliases.some(x=>normalizedTitle(x)===normalizedTitle(q)))return ['我们不可能成为恋人'];
 const s=seasonQuery(q);if(!s)return [q];
 // Three actual public API queries at most. No fuzzy season rewrite in identity rules.
 return [...new Set([`${s.base}第${chinese(s.season)}季`,q,`${s.base}第${s.season}季`])].slice(0,3);
}
export function relevance(f:Pick<Film,'title'|'season'|'category'>,query:string):number{
 const terms=searchTerms(query),q=normalizedTitle(query),name=normalizedTitle(f.title),desired=seasonQuery(query),actual=seasonQuery(f.title);
 if(name===q)return 1200;
 if(desired){const base=normalizedTitle(desired.base),filmBase=normalizedTitle(actual?.base||f.title),season=f.season??actual?.season;if(filmBase===base&&season===desired.season)return 1150;if(filmBase===base)return season===undefined?500:300-Math.abs(season-desired.season);if(!filmBase.includes(base))return 0;return season===desired.season?850:150}
 const matched=terms.map(normalizedTitle).find(t=>name===t||name.includes(t));if(!matched)return 0;return name===matched?1100:700-Math.min(150,name.length-matched.length);
}
