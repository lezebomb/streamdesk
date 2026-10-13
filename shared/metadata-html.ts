import {DOMParser} from 'linkedom';
import type {Film} from './model';
import {validYear,validReleaseDate} from './metadata.ts';
import {normalizeGenres,normalizeLanguages} from './catalogue-policy.ts';
import {seasonOf} from './cms.ts';
const text=(e:Element|null)=>e?.textContent?.replace(/\s+/g,' ').trim()||'';
const parseDocument=(html:string)=>new DOMParser().parseFromString(html,'text/html') as unknown as Document;
function withRating(f:Film,score:number,votes:number|undefined,now:number):Film {
 if(f.year&&f.category&&score>0&&score<=10)f.doubanRating={score,votes,subjectId:f.id,checkedAt:now,identity:{title:f.title,year:f.year,category:f.category,season:f.season}};
 return f;
}
export function parseRankingHTML(html:string,url:string,now=Date.now()):{films:Film[];next?:string;subjects:string[]}{
 const doc=parseDocument(html),films:Film[]=[],subjects=new Set<string>();
 for(const a of Array.from(doc.querySelectorAll('a[href]'))){try{const u=new URL(a.getAttribute('href')!,url);const id=u.hostname==='movie.douban.com'?u.pathname.match(/^\/subject\/(\d+)\/$/)?.[1]:undefined;if(id)subjects.add(id)}catch{}}
 for(const e of Array.from(doc.querySelectorAll('.grid_view>li'))){
  const info=e.querySelector('.info'),link=info?.querySelector('.hd a'),id=link?.getAttribute('href')?.match(/\/subject\/(\d+)/)?.[1];if(!id)continue;
  const raw=text(parseDocument('<div>'+(info?.querySelector('.bd p')?.innerHTML||'').replace(/<br\s*\/?\s*>/gi,' ')+'</div>').querySelector('div')),start=raw.search(/\b\d{4}\s*\//);if(start<0)continue;
  const parts=raw.slice(start).split('/').map(s=>s.trim()),year=validYear(parts[0],now),title=text(info?.querySelector('.title')||null);if(!year||!title)continue;
  const film:Film={id,sourceId:'metadata',canonicalId:'douban:'+id,title,category:'电影',contentKind:'regular',year,regions:(parts[1]||'').split(/\s+/),genres:normalizeGenres(parts[2]||''),poster:e.querySelector('.pic img')?.getAttribute('src')||undefined,metadataVerifiedAt:now,episodes:[]};
  const votes=Array.from(e.querySelectorAll('.star span')).map(span=>text(span).match(/^(\d+)\s*人评价/)?.[1]).find(Boolean);
  films.push(withRating(film,Number(text(e.querySelector('.rating_num'))),Number(votes)||undefined,now));
 }
 const next=doc.querySelector('.next a')?.getAttribute('href');const nextURL=next?new URL(next,url):null;
 return {films,subjects:[...subjects],next:nextURL?.hostname==='movie.douban.com'&&nextURL.pathname==='/top250'?nextURL.href:undefined};
}
export function parseSubjectHTML(html:string,id:string,now=Date.now()):Film|undefined{
 if(!/^\d+$/.test(id))return;const doc=parseDocument(html),title=text(doc.querySelector('[property="v:itemreviewed"]'));if(!title)return;
 const canonical=doc.querySelector('meta[property="og:url"]')?.getAttribute('content')||doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
 if(canonical){try{const u=new URL(canonical);if(u.origin!=='https://movie.douban.com'||u.pathname!=='/subject/'+id+'/')return}catch{return}}
 let json:Record<string,any>={};try{json=JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent||'{}')}catch{}
 const rawInfo=doc.querySelector('#info')?.innerHTML||'',info=rawInfo.split(/<br\s*\/?\s*>/i).map(line=>text(parseDocument('<div>'+line+'</div>').querySelector('div')));
 const value=(label:string)=>info.find(s=>s.startsWith(label+':')||s.startsWith(label+'：'))?.replace(new RegExp('^'+label+'[:：]\\s*'),'')||'';
 const genres=normalizeGenres(Array.from(doc.querySelectorAll('[property="v:genre"]')).map(e=>text(e)).join(','));
 const series=json['@type']==='TVSeries'||!!value('集数'),variety=genres.some(g=>['真人秀','脱口秀'].includes(g));
 if(!series&&!variety&&json['@type']!=='Movie')return;
 const category=variety?'综艺':series?(genres.includes('动画')?'动漫':'电视剧'):'电影';
 const dates=Array.from(doc.querySelectorAll('[property="v:initialReleaseDate"]')).map(e=>text(e)),released=dates.map(d=>validReleaseDate(d,now)).filter((d):d is string=>!!d).sort()[0];
 const score=Number(json.aggregateRating?.ratingValue||text(doc.querySelector('[property="v:average"]'))),votes=Number(json.aggregateRating?.ratingCount||text(doc.querySelector('[property="v:votes"]')))||undefined;
 const primaryTitle=/[\u4e00-\u9fff]/.test(title)?title.replace(/\s+[A-Za-z].*$/,''):title,year=validYear(text(doc.querySelector('.year')),now);if(!year)return;
 const film:Film={id,sourceId:'metadata',canonicalId:'douban:'+id,title:primaryTitle,category,season:seasonOf(primaryTitle,category),year,genres,regions:value('制片国家/地区').split('/').map(s=>s.trim()).filter(Boolean),language:normalizeLanguages(value('语言')).join(','),contentKind:'regular',releaseDate:released,releasePending:!released&&dates.some(d=>Date.parse(d.slice(0,10))>now),poster:doc.querySelector('#mainpic img')?.getAttribute('src')||undefined,metadataVerifiedAt:now,episodes:[]};
 return withRating(film,score,votes,now);
}
