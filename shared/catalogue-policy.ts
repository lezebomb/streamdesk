import type {Film} from './model';
import {ratingScore,ratingVotes} from './ratings.ts';
export const catalogueGenres:Record<string,string[]>={
 '电影':['剧情','爱情','喜剧','动作','犯罪','悬疑','惊悚','科幻','奇幻','冒险','恐怖','战争','动画','纪录片','家庭','历史','音乐','灾难','武侠'],
 '电视剧':['剧情','爱情','喜剧','犯罪','悬疑','惊悚','科幻','奇幻','家庭','历史','战争','武侠'],
 '动漫':['剧情','爱情','喜剧','动作','冒险','奇幻','科幻','悬疑','运动','日常'],
 '综艺':['真人秀','脱口秀','音乐','歌舞','喜剧','冒险','游戏','美食','旅行']
};
export const allGenres=[...new Set(Object.values(catalogueGenres).flat())];
const languageAliases:Record<string,string>={'汉语普通话':'国语','普通话':'国语','汉语':'国语','中文':'国语','中国语':'国语','英':'英语','英文':'英语','English':'英语','日文':'日语','日本语':'日语','Japanese':'日语','韩文':'韩语','韩国语':'韩语','한국어':'韩语','Cantonese':'粤语','French':'法语','德文':'德语','German':'德语','Thai':'泰语'};
export function normalizeLanguages(raw:string):string[]{return [...new Set(raw.split(/[,，、/;；\s]+/).filter(Boolean).map(s=>languageAliases[s]||s))]}
export function normalizeGenres(raw:string):string[]{return [...new Set(raw.split(/[,，、/;；\s]+/).filter(Boolean).map(s=>allGenres.includes(s)?s:/^(纪录|记录)(片)?$/.test(s)?'纪录片':s.replace(/(?:电影|片|剧)$/,'')).filter(s=>allGenres.includes(s)))]}
export function contentKind(title:string,category:string):Film['contentKind']{
 if(/解说/.test(category)||/\[解说\]|电影解说|影视解说/.test(title))return 'commentary';
 if(/预告|花絮|幕后/.test(category)||/\[预告片\]|预告片$/.test(title))return 'trailer';
 if(/AI短剧|AI动漫|AI动画|AI漫剧|AIGC|人工智能生成/i.test(category+' '+title))return 'ai';
 if(/短剧|漫剧|爽文/.test(category))return 'short';
 if(/体育|足球|篮球|斯诺克|网球|电竞|赛事|NBA|CBA|LPL|英超|德甲|意甲|西甲|法甲/i.test(category))return 'sports';
 return ['电影','电视剧','综艺','动漫'].includes(category)?'regular':'other';
}
export function japaneseAnime(f:Film):boolean{return f.category==='动漫'&&(f.regions?.includes('日本')||/^(?:日本|日语|日)动漫/.test(f.originCategory||''))||false}
export function normalCatalogueEntry(f:Film):boolean{return (!f.contentKind||f.contentKind==='regular')&&['电影','电视剧','综艺','动漫'].includes(f.category||'')}
export function recommendable(f:Film):boolean{
 if(!normalCatalogueEntry(f))return false;
 if(f.category==='动漫')return japaneseAnime(f);
 return !(f.genres?.includes('动画')&&f.regions?.some(r=>/中国|大陆|香港|台湾|内地/.test(r)));
}
export function recommendationScore(f:Film,now=Date.now()):number{
 const date=f.releaseDate?Date.parse(f.releaseDate):Date.UTC(Number(f.year),0,1),age=Math.max(0,(now-date)/86400000);
 return Math.log1p(ratingVotes(f)||f.popularity||0)*4+Math.max(0,1-age/365)*25+(ratingScore(f)||5)*2+(f.metadataVerifiedAt?5:0);
}
