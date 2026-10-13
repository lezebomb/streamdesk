import {relevance} from '../shared/search-relevance';
import {validYear} from '../shared/metadata';
import {bindClientUpdates} from './client-updates';
import {installNativeTransport} from './native-transport';
import {installAbortCompatibility} from '../shared/abort';
import {catalogueGenres} from '../shared/catalogue-policy';
import {displayRating,verifiedRating} from '../shared/ratings';
import {probeMedia} from '../shared/media-probe';
import {candidateScore,candidateKey,uniqueCandidates,mediaDomain,type Candidate} from '../shared/source-candidates';import './style.css';
import {shell,icon} from './view';
import {filterFilms,selectedGenres,type Filters} from '../shared/discovery';
import {bindVideoGestures} from './gestures';
import {bindPosters,posterMarkup} from './posters';
import {bindVideoKeyboard} from './keyboard';
import {appendFilms} from '../shared/result-list';
import {downloads,saveDownload,removeDownload} from './downloads';
import {bindCasting} from './casting';
import {Player} from './player';
import {store} from './storage';
import {blankHealth,observe,healthScore,sameFilm,matchEpisode,poolMap} from '../shared/policy';
import type {Film,Episode,Source,Metrics} from '../shared/model';
import {playbackGroups} from '../shared/cms';
import {consumeSearch} from '../shared/search';
import {resumeEpisode,historyEpisodeLabel} from '../shared/library';
const $=<T extends HTMLElement=HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let sources:Source[]=[],films:Film[]=[],current:Film|null=null,episode:Episode|null=null,view='discover',switching=false,auto=true,searchRun=0,detailRun=0;
const attempted=new Set<string>();let attemptLogged=false;let switches=0;
let lastHistorySave=0;
function mediaHealthKey(f:Film,e:Episode){try{return `${f.sourceId}|${new URL(e.url).hostname}`}catch{return f.sourceId}}
$('#app').innerHTML=shell();
installAbortCompatibility();
try{await installNativeTransport()}catch{ $('#search-status').textContent='本机接口启动失败，请重新打开应用';throw Error('Native transport startup failed') }
bindClientUpdates();
const posters=bindPosters($('.app-shell'));
let toastTimer:ReturnType<typeof setTimeout>;function toast(s:string){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4000)}
async function api(url:string,options:RequestInit={}){const r=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function updateHealth(id:string,event:Parameters<typeof observe>[1]){store.health[id]=observe(store.health[id]||blankHealth(),event);store.save();renderSources()}
function visibleLibraryFilm(f:Film){return sources.some(s=>s.enabled&&s.type==='catalog')||(!f.sourceId.startsWith('open-')&&f.category!=='测试流')}
function renderSources(){ $('#fav-count').textContent=String(store.favorites.filter(visibleLibraryFilm).length);renderRecent() }
function card(f:Film,index:number,library=false){const h=store.history.find(x=>store.matches(x.film,f)),r=displayRating(f);return `<button class="film-card" data-film="${index}" data-library="${library}"><div class="poster">${posterMarkup(f,index<2)}${f.remarks?`<span class="poster-tag">${esc(f.remarks)}</span>`:''}${r?`<span class="poster-score" title="${esc(r.label)}" aria-label="${esc(r.label)} ${r.score.toFixed(1)}">${r.score.toFixed(1)}</span>`:''}</div><div class="card-info"><strong>${esc(f.title)}</strong><small>${esc(validYear(f.year)||'年份待核实')}${h?` · 看到 ${Math.floor(h.position/60)}:${String(Math.floor(h.position%60)).padStart(2,'0')}`:''}</small></div></button>`}
let activeQuery='';
let browseCursors:Record<string,number>={};
let browsePage=0,browseHasMore=true,browseBusy=false,isSearch=false,batchOffset=0,browseRun=0,browseController:AbortController|null=null;
let filters:Filters={category:'推荐',genre:[],language:'全部',year:'全部',sort:'latest'};
let displayed:Film[]=[],resultLimit=48,renderTimer:ReturnType<typeof setTimeout>|undefined;
function resetCards(){clearTimeout(renderTimer);renderTimer=undefined;displayed=[];resultLimit=48;ratingObserver.disconnect();$('#results').innerHTML=''}
function scheduleResults(){if(!renderTimer)renderTimer=setTimeout(()=>{renderTimer=undefined;renderResults()},300)}
let recentKey="";function renderRecent(){const h=store.history.find(h=>visibleLibraryFilm(h.film));$('#recent-section').hidden=filters.category!=='推荐'||isSearch||!h;const key=h?[h.film.sourceId,h.film.id,h.film.title,h.film.year,h.film.season,h.film.poster].join('|'):'';if(key===recentKey&&$('#resume-recent')){const label=$('#recent small');label.textContent=historyEpisodeLabel(h!)+' · 看到 '+Math.floor(h!.position/60)+':'+String(Math.floor(h!.position%60)).padStart(2,'0');return}recentKey=key;$('#recent').innerHTML=h?`<button id="resume-recent" class="recent-card">${posterMarkup(h.film,true)}<span><strong>${esc(h.film.title)}</strong><small>${esc(historyEpisodeLabel(h))} · 看到 ${Math.floor(h.position/60)}:${String(Math.floor(h.position%60)).padStart(2,'0')}</small></span>${icon('play-circle')}</button>`:'';$('#resume-recent')?.addEventListener('click',()=>void openFilm(h!.film))}
function renderFilters(){const year=new Date().getFullYear();const rows=[['类型','genre',['全部',...(catalogueGenres[filters.category]||[])]],['语言','language',['全部','国语','英语','日语','粤语','韩语','法语','德语','泰语','西班牙语','意大利语','俄语','印地语']],['年份','year',['全部',...Array.from({length:10},(_,i)=>String(year-i)),'更早']],['排序','sort',['latest','score']]] as const;$('#filters').hidden=filters.category==='推荐'||isSearch;$('#filters').innerHTML=rows.map(([label,key,values])=>'<div class="filter-row"><strong>'+label+':</strong><div class="filter-scroll">'+values.map(value=>{const active=key==='genre'?(value==='全部'?!selectedGenres(filters.genre).length:selectedGenres(filters.genre).includes(value)):filters[key]===value;return '<button data-filter="'+key+'" data-value="'+value+'" aria-pressed="'+active+'" class="'+(active?'active':'')+'">'+(value==='latest'?'最新':value==='score'?'高分':value)+'</button>'}).join('')+'</div></div>').join('')}
function sourcePreference(id:string){const h=store.health[id]||blankHealth();return healthScore(h)+(h.playSamples?0:sources.find(s=>s.id===id)?.priority||0)}
function renderResults(){
 const selected=isSearch?appendFilms([],films).sort((a,b)=>relevance(b,activeQuery)-relevance(a,activeQuery)||sourcePreference(b.sourceId)-sourcePreference(a.sourceId)):filterFilms(films,filters);
 const target=filters.category==='推荐'&&!isSearch?selected.slice(batchOffset,batchOffset+18):selected.slice(0,resultLimit);
 const previous=displayed.length;displayed=appendFilms(displayed,target).slice(0,filters.category==='推荐'&&!isSearch?18:resultLimit);
 if(displayed.length){$('#results .empty')?.remove();$('#results').insertAdjacentHTML('beforeend',displayed.slice(previous).map((f,i)=>card(f,previous+i)).join(''))}
 else $('#results').innerHTML=(browseBusy||$('#search-form').getAttribute('aria-busy')==='true')?'<div class="empty loading-empty">'+icon('spinner-gap')+' 正在寻找影片…</div>':'<div class="empty">'+(isSearch?'暂时没有找到，试试简称或其他译名':'暂无符合筛选的影片，可继续加载或调整条件')+'</div>';
 $('#load-sentinel').hidden=isSearch||(!browseHasMore&&selected.length<=resultLimit);$('#load-more').textContent=browseBusy?'正在加载…':'加载更多';$<HTMLButtonElement>('#load-more').disabled=browseBusy;renderRecent();for(const el of document.querySelectorAll<HTMLElement>('#results .film-card')){ratingObserver.observe(el);const img=el.querySelector<HTMLImageElement>('img[data-posters]');if(img)posters.update(img,displayed[Number(el.dataset.film)])}
}
let libraryFilms:Film[]=[];
const ratingSeen=new Set<string>(),ratingQueue=new Map<string,Film>();let ratingTimer:ReturnType<typeof setTimeout>|undefined,ratingBusy=false;
const ratingKey=(f:Film)=>f.sourceId+':'+f.id;
function updateRatingDOM(el:HTMLElement,f:Film){const rating=displayRating(f);if(!rating)return;let badge=el.querySelector<HTMLElement>('.poster-score');if(!badge){badge=document.createElement('span');badge.className='poster-score';el.querySelector('.poster')?.append(badge)}badge.textContent=rating.score.toFixed(1);badge.title=rating.label;badge.setAttribute('aria-label',rating.label+' '+rating.score.toFixed(1))}
function renderFilmRating(f:Film){const r=displayRating(f);$('#film-rating').hidden=!r;$('#film-rating').textContent=r?r.score.toFixed(1)+' · '+r.label:''}
async function requestRatings(items:Film[],verify=false){try{const data=await api('/api/ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map(f=>({source:f.sourceId,id:f.id})),verify})});for(const result of data.ratings){for(const f of [...displayed,...libraryFilms,...(current?[current]:[])])if(f.sourceId===result.source&&f.id===result.id){const candidate={...f,doubanRating:result.rating};if(verifiedRating(candidate))f.doubanRating=result.rating}for(const el of document.querySelectorAll<HTMLElement>('.film-card')){const f=(el.dataset.library==='true'?libraryFilms:displayed)[Number(el.dataset.film)];if(f)updateRatingDOM(el,f)}if(current)renderFilmRating(current)}}catch{/* Ratings never change playback or search failure state. */}}
function scheduleRatings(){if(ratingTimer||ratingBusy||!ratingQueue.size)return;ratingTimer=setTimeout(()=>{ratingTimer=undefined;if(browseBusy||$('#search-form').getAttribute('aria-busy')==='true'||!$('#watch').hidden){scheduleRatings();return}const batch=[...ratingQueue.values()].slice(0,12);for(const f of batch)ratingQueue.delete(ratingKey(f));ratingBusy=true;void requestRatings(batch).finally(()=>{ratingBusy=false;scheduleRatings()})},800)}
const ratingObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const el=entry.target as HTMLElement,f=displayed[Number(el.dataset.film)];ratingObserver.unobserve(el);if(!f?.canonicalId||verifiedRating(f)||ratingSeen.has(ratingKey(f)))continue;ratingSeen.add(ratingKey(f));if(ratingSeen.size>2000)ratingSeen.delete(ratingSeen.values().next().value!);ratingQueue.set(ratingKey(f),f)}scheduleRatings()},{rootMargin:'100px'});
function navigate(v:string){view=v;for(const b of document.querySelectorAll<HTMLButtonElement>('.bottom-nav [data-view]')){const active=b.dataset.view===(v==='discover'?'discover':'my');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))}$('#discover-view').hidden=v!=='discover';$('#my-view').hidden=v!=='my';$('#library-view').hidden=!['favorites','history','downloads'].includes(v);$('#view-title').textContent=({favorites:'我的收藏',history:'观看记录',downloads:'我的下载'} as Record<string,string>)[v]||'';
 if(['favorites','history','downloads'].includes(v)){libraryFilms=v==='favorites'?store.favorites.filter(visibleLibraryFilm):v==='history'?store.history.map(h=>h.film).filter(visibleLibraryFilm):downloads().map(d=>d.film);$('#library').innerHTML=libraryFilms.length?libraryFilms.map((f,i)=>`<div class="library-item">${card(f,i,true)}${v==='downloads'?`<button class="download-delete text-button" data-download-delete="${i}">删除下载</button>`:''}</div>`).join(''):'<div class="empty">'+(v==='downloads'?'还没有下载的视频。在播放页面选择下载本集。':'这里还没有记录，选择影片开始观看吧。')+'</div>'}
}
async function browse(reset=false){if(browseBusy&&!reset)return;if(reset){setSearchBusy(false);$('#search-status').textContent='';browseController?.abort();browsePage=0;browseCursors={};films=[];resetCards();batchOffset=0;browseHasMore=true;isSearch=false;++browseRun;searchController?.abort();++searchRun}const run=browseRun;const controller=browseController=new AbortController();browseBusy=true;$('#results-heading').textContent=filters.category==='推荐'?'近期热门':filters.category==='电视剧'?'剧集':filters.category;$('#refresh').hidden=filters.category!=='推荐';$('#more-discover').hidden=filters.category!=='推荐';$('#results-banner').hidden=filters.category!=='推荐';renderFilters();renderResults();
 try{const r=await fetch('/api/browse?stream=1&category='+encodeURIComponent(filters.category)+'&page='+(browsePage+1)+'&genre='+encodeURIComponent(selectedGenres(filters.genre).join(','))+'&language='+encodeURIComponent(filters.language)+'&year='+encodeURIComponent(filters.year)+'&sort='+filters.sort+'&cursors='+encodeURIComponent(JSON.stringify(browseCursors)),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(23000)])});let more=false;await consumeSearch(r,event=>{if(run!==browseRun)return;if(event.type==='source'){const row=event.row as typeof event.row&{hasMore:boolean;nextPage?:number};if(row.nextPage!==undefined)browseCursors[row.sourceId]=row.nextPage;films.push(...row.list);more ||= row.hasMore;if(filters.sort!=='score'||row.sourceId==='catalogue-index')scheduleResults()} });if(run!==browseRun)return;browsePage++;browseHasMore=more;$('#search-status').textContent=filters.sort==='score'?'按豆瓣评分排序，暂无评分的影片排在后面':'';
 }catch(e){if(!controller.signal.aborted&&run===browseRun)$('#search-status').textContent='部分片库暂时连接不上，点击加载更多重试'}finally{if(run===browseRun){browseBusy=false;renderResults()}}
}
let searchProgress={finished:0,total:0,ms:0};
let searchController:AbortController|null=null;
function setSearchBusy(busy:boolean){$('#search-form').classList.toggle('search-busy',busy);$('#search-form').setAttribute('aria-busy',String(busy));$('#search-status').classList.toggle('is-loading',busy);$('#search-form button').innerHTML=busy?icon('spinner-gap')+' 搜索中':'搜索'}
function setSearchStatus(text:string,busy:boolean){$('#search-status').innerHTML=(busy?icon('spinner-gap'):'')+esc(text);$('#search-status').classList.toggle('is-loading',busy)}
async function search(q=''){
 $('#results-banner').hidden=false;activeQuery=q;setSearchBusy(true);isSearch=true;browseController?.abort();++browseRun;browseBusy=false;renderFilters();navigate('discover');$('#recent-section').hidden=true;$('#refresh').hidden=true;$('#more-discover').hidden=true;const run=++searchRun;searchController?.abort();searchController=new AbortController();let finished=0,failed=0,total=0;films=[];resetCards();
 $('#results-heading').textContent=q?`“${q}” 的搜索结果`:'影片';$('#results').innerHTML='';$('#load-sentinel').hidden=true;
 setSearchStatus('搜索中…',true);
 try{const r=await fetch('/api/search?stream=1&q='+encodeURIComponent(q),{signal:AbortSignal.any([searchController.signal,AbortSignal.timeout(23000)])});
  await consumeSearch(r,event=>{if(run!==searchRun)return;
   if(event.type==='start'){total=event.total;searchProgress={finished:0,total,ms:0}};
   if(event.type==='source'){finished++;searchProgress.finished=finished;if(!event.row.ok)failed++;films.push(...event.row.list);updateHealth(event.row.sourceId,{kind:'api',ok:event.row.ok,ms:event.row.ms});scheduleResults();setSearchStatus(`搜索中… 已找到 ${films.length} 条结果`,true)}
   if(event.type==='done'){searchProgress.ms=event.ms;setSearchBusy(false);$('#search-status').textContent=`找到 ${films.length} 条结果`;}

  });if(run===searchRun)renderResults();
 }catch(e){if(run!==searchRun)return;$('#search-status').textContent=`已显示 ${films.length} 条结果 · 搜索未完成：${String(e)}`;toast('部分搜索失败：'+String(e))}finally{if(run===searchRun)setSearchBusy(false)}
}
let candidates:Candidate[]=[];const probeCache=new Map<string,import('../shared/media-probe').MediaProbe>();let probing:Promise<void[]>|null=null;let findingLines:Promise<void>|null=null;let linesController:AbortController|null=null,linesEpoch=0;
function localLines(f:Film,e:Episode){return playbackGroups(f).flatMap(g=>{const ep=matchEpisode(e,g.episodes);return ep?[{film:f,episode:ep}]:[]})}
function activeEpisodes(){return current?playbackGroups(current).find(g=>g.id===episode?.groupId)?.episodes||current.episodes:[]}
async function openFilm(f:Film){const run=++detailRun;linesController?.abort();++linesEpoch;finishAttempt(true);player.stop();$('#embed').removeAttribute('src');current=null;episode=null;$('#film-rating').hidden=true;attempted.clear();switches=0;candidates=[];findingLines=null;$('#lines').innerHTML='';$('#episodes').innerHTML='';$('#quality').innerHTML='<option value="-1">自动</option>';$('#watch').hidden=false;$('.app-header').hidden=true;$('.bottom-nav').hidden=true;$('#discover-view').hidden=true;$('#my-view').hidden=true;$('#library-view').hidden=true;$('#watch').scrollIntoView({behavior:'smooth',block:'start'});$('#film-title').textContent=f.title;$('#play-status').textContent='正在获取详情…';
 try{const d=await api(`/api/detail?source=${encodeURIComponent(f.sourceId)}&id=${encodeURIComponent(f.id)}`);if(run!==detailRun)return;current=d.film;renderFilmRating(current!);void requestRatings([current!],true);if(!current!.episodes.length){const fallback=await playableAlternative(f,run);if(run!==detailRun)return;if(fallback)current=fallback}updateHealth(f.sourceId,{kind:'api',ok:true,ms:d.ms});if(!current!.episodes.length)throw new Error('暂时没有可播放线路，请稍后重试');$('#description').textContent=current!.description||'';const history=store.history.find(x=>store.matches(x.film,current!));episode=(history?resumeEpisode(history,current!):undefined)||current!.episodes[0];renderEpisodes();await playEpisode(episode,history&&resumeEpisode(history,current!)?.key===episode.key?history.position:0);await findLines();
 }catch(e){if(run===detailRun){$('#play-status').textContent=String(e);toast(String(e))}}
}
async function playableAlternative(f:Film,run:number){const data=await api('/api/search?q='+encodeURIComponent(f.title));const hits=(data.rows.flatMap((r:{list:Film[]})=>r.list) as Film[]).filter(x=>sameFilm(x,f)&&!(x.sourceId===f.sourceId&&x.id===f.id)).sort((a,b)=>sourcePreference(b.sourceId)-sourcePreference(a.sourceId)).slice(0,4);for(const hit of hits){if(run!==detailRun)return;try{const other=(await api('/api/detail?source='+encodeURIComponent(hit.sourceId)+'&id='+encodeURIComponent(hit.id))).film as Film;if(sameFilm(f,other)&&other.episodes.length)return other}catch{}}}
function renderEpisodes(){if(!current)return;const eps=activeEpisodes();$('#episode-count').textContent=String(eps.length);$('#episodes').innerHTML=eps.map((e,i)=>`<button data-episode="${i}" aria-pressed="${e.key===episode?.key}" class="${e.key===episode?.key?'selected':''}">${esc(e.label)}</button>`).join('');$('#favorite').textContent=store.favorite(current)?'已收藏':'收藏';renderSources()}
function finishAttempt(ok:boolean){if(!current||!episode||attemptLogged||episode.kind==='embed')return;const m=player.snapshot();if(m.firstFrameMs===null&&ok)return;attemptLogged=true;const bandwidth=m.fragments.length?m.fragments.reduce((s,f)=>s+f.bytes,0)*8/m.fragments.reduce((s,f)=>s+f.ms,0)/1000:undefined;const observation={kind:'play' as const,ok,ms:m.firstFrameMs??undefined,mbps:bandwidth,stallMs:m.stallMs,watchMs:m.watchMs,height:player.qualityState().height};const activeCandidate=candidates.find(c=>c.episode.url===episode!.url);if(ok&&m.watchMs>=10000&&activeCandidate)activeCandidate.decodedHeight=player.qualityState().height;updateHealth(current.sourceId,observation);updateHealth(mediaHealthKey(current,episode),observation)}
async function playEpisode(e:Episode,position=0){if(!current)return;finishAttempt(true);episode=e;attemptLogged=false;attempted.add(e.url);$('#film-title').textContent=current.title;$<HTMLSelectElement>('#speed').value='1';player.video.playbackRate=1;renderEpisodes();$('#video').hidden=e.kind==='embed';$('#embed').hidden=e.kind!=='embed';$('#embed').removeAttribute('src');
 $('#quality').innerHTML='<option value="-1">自动</option>';qualitySignature='';
 if(e.kind==='embed'){player.stop();$('#embed').setAttribute('src',e.url);$('#play-status').textContent='嵌入模式 · 进度和性能由来源管理';}
 else {player.contentAnime=current.category==='动漫';await player.load(e,position,true,switches,store.health[mediaHealthKey(current,e)]?.mbps??undefined);}
}
let qualitySignature='';
const player=new Player($('#video'),s=>$('#play-status').textContent=s,reason=>void failover(reason),m=>{
 const actual=player.qualityState();$('#actual-quality').textContent=actual.width?`${actual.width}×${actual.height} · ${actual.presentedFps?.toFixed(0)||'—'} fps · ${actual.codec||'编码未知'}${actual.manifestBitrate?' · '+(actual.manifestBitrate/1e6).toFixed(1)+' Mbps':''}`:'';const enhanced=actual.enhancement;$('#enhancement-status').textContent=enhanced.mode==='off'?'增强已完全关闭 · 原画':(enhanced.active?'空间增强 '+enhanced.profile+' · 输出 '+enhanced.renderSize.join('×')+'（非原生）':enhanced.reason);
 const q=$<HTMLSelectElement>('#quality'),levels=player.qualityLevels(),signature=JSON.stringify(levels);if(signature!==qualitySignature){qualitySignature=signature;q.innerHTML='<option value="-1">自动</option>'+levels.map(l=>`<option value="${l.i}">${esc(l.label)}</option>`).join('')}
 q.value=String(player.manualLevel);
 if(current&&episode&&m.firstFrameMs!==null&&Date.now()-lastHistorySave>=5000){lastHistorySave=Date.now();store.remember(current,episode.key,player.resumePosition(),episode)}
});
function renderLines(){const h=(c:{film:Film;episode:Episode})=>store.health[mediaHealthKey(c.film,c.episode)]||blankHealth();candidates=uniqueCandidates(candidates);candidates.sort((a,b)=>candidateScore(b,store.health)-candidateScore(a,store.health));$('#lines').innerHTML=candidates.map((c,i)=>`<button class="line ${c.film.sourceId===current?.sourceId&&c.episode.url===episode?.url?'selected':''}" data-line="${i}"><span>${esc(sources.find(s=>s.id===c.film.sourceId)?.name||c.film.sourceId)} · ${esc(c.film.groups?.find(g=>g.id===c.episode.groupId)?.name||'默认')}</span><small>${c.probe&&!c.probe.ok?'暂时无法连接':c.episode.url===episode?.url?'正在播放':'备用线路'}</small></button>`).join('')||'<p class="muted">尚无同集备用线路</p>'}
function findLines(){if(findingLines)return findingLines;if(current&&episode){candidates=localLines(current,episode);renderLines()}const work=resolveLines();findingLines=work;void work.finally(()=>{if(findingLines===work)findingLines=null});return work}
async function resolveLines(){const f=current,e=episode,run=detailRun,epoch=++linesEpoch;if(!f||!e)return;linesController?.abort();const controller=linesController=new AbortController();$('#find-lines').textContent='正在匹配…';try{
 const d=await api('/api/search?q='+encodeURIComponent(f.title),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(23000)])});const hits:Film[]=d.rows.flatMap((r:{list:Film[]})=>r.list).filter((x:Film)=>sameFilm(x,f)&&!(x.sourceId===f.sourceId&&x.id===f.id));
 await poolMap(hits,2,async hit=>{try{if(controller.signal.aborted)return;const other=(await api(`/api/detail?source=${encodeURIComponent(hit.sourceId)}&id=${encodeURIComponent(hit.id)}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])})).film as Film;
  if(run!==detailRun||epoch!==linesEpoch||episode?.key!==e.key||!sameFilm(other,f))return;
  for(const c of localLines(other,e))if(!candidates.some(x=>x.film.sourceId===c.film.sourceId&&x.episode.url===c.episode.url))candidates.push(c);renderLines();
 }catch{/* One source must not discard other candidates. */}});
 }catch(err){if(!controller.signal.aborted&&run===detailRun)toast('查找线路失败：'+String(err))}finally{if(epoch===linesEpoch){$('#find-lines').textContent='查找其他来源';void probeLines(controller.signal,epoch);}}
}
async function switchLine(c:{film:Film;episode:Episode},position:number){finishAttempt(true);current=c.film;switches++;await playEpisode(c.episode,position);$('#description').textContent=current.description||'';renderLines()}
async function failover(reason:string){if(switching||!current||!episode||episode.kind==='embed')return;finishAttempt(false);if(!auto){$('#play-status').textContent=reason+' · 自动换源已关闭';return}switching=true;try{
 const run=detailRun,failedFilm=current,failedUrl=episode.url;if(!candidates.some(c=>!attempted.has(candidateKey(c))))await findLines();if(run!==detailRun||current!==failedFilm||episode?.url!==failedUrl)return;
 if(!auto){$('#play-status').textContent=reason+' · 自动换源已关闭';return}
 const position=player.resumePosition();const failedCandidate=candidates.find(c=>c.episode.url===failedUrl);candidates.sort((a,b)=>candidateScore(b,store.health,failedCandidate?mediaDomain(failedCandidate):undefined)-candidateScore(a,store.health,failedCandidate?mediaDomain(failedCandidate):undefined));const next=candidates.find(c=>c.episode.kind!=='embed'&&!attempted.has(candidateKey(c))&&(store.health[mediaHealthKey(c.film,c.episode)]?.cooldownUntil||0)<=Date.now());
 if(!next){player.stop();$('#play-status').textContent=reason+' · 没有同集备用线路，请手动选择来源';return}toast('线路异常，正在保留进度换源');await switchLine(next,position);
 }finally{switching=false}}
document.addEventListener('click',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('button');if(!el)return;
 if(el.dataset.view)navigate(el.dataset.view);
 if(el.dataset.film!==undefined){const n=Number(el.dataset.film);if(view==='downloads'&&el.dataset.library==='true')void openDownloaded(n);else void openFilm((el.dataset.library==='true'?libraryFilms:displayed)[n])}
 if(el.dataset.category){$<HTMLInputElement>('#query').value='';filters={category:el.dataset.category,genre:[],language:'全部',year:'全部',sort:'latest'};for(const b of document.querySelectorAll<HTMLElement>('[data-category]')){b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el))}void browse(true)}
 if(el.dataset.filter){const key=el.dataset.filter,value=el.dataset.value!;if(key==='genre'){const selected=selectedGenres(filters.genre);filters.genre=value==='全部'?[]:selected.includes(value)?selected.filter(g=>g!==value):[...selected,value]}else Object.assign(filters,{[key]:value});void browse(true);$('#search-status').textContent=filters.sort==='score'?'按豆瓣评分排序，暂无评分的影片排在后面':''}
 if(el.dataset.downloadDelete!==undefined)void removeDownload(downloads()[Number(el.dataset.downloadDelete)].id).then(()=>navigate('downloads'));
 if(el.dataset.episode!==undefined&&current){const next=activeEpisodes()[Number(el.dataset.episode)];linesController?.abort();++linesEpoch;findingLines=null;candidates=[];attempted.clear();void playEpisode(next);void findLines()}
 if(el.dataset.line!==undefined){const position=episode?.kind==='embed'?0:player.resumePosition();attempted.clear();void switchLine(candidates[Number(el.dataset.line)],position)}
});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();const input=$<HTMLInputElement>('#query'),query=input.value.trim();input.blur();query?void search(query):void browse(true)});

$('#favorite').onclick=()=>{if(current){store.toggle(current);renderEpisodes()}};
$('#close-watch').onclick=()=>{++detailRun;linesController?.abort();++linesEpoch;if(current&&episode&&episode.kind!=='embed')store.remember(current,episode.key,player.resumePosition(),episode);finishAttempt(true);player.stop();$('#embed').removeAttribute('src');$('#watch').hidden=true;$('.app-header').hidden=false;$('.bottom-nav').hidden=false;current=null;episode=null;navigate(view);renderRecent()};
$('#find-lines').onclick=()=>void findLines();
$<HTMLInputElement>('#auto-switch').onchange=e=>auto=(e.target as HTMLInputElement).checked;
$<HTMLSelectElement>('#quality').onchange=e=>player.setQuality(Number((e.target as HTMLSelectElement).value));
function download(filename:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#export-data').onclick=()=>download('streamdesk-library.json',store.export());
$('#import-data').onclick=()=>$('#import-file').click();
$<HTMLInputElement>('#import-file').onchange=async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('备份超过 8 MiB');store.import(JSON.parse(await file.text()));renderSources();if(['favorites','history'].includes(view))navigate(view);toast('已恢复收藏与历史')}catch(error){toast('导入失败，原记录保留：'+String(error))}finally{input.value=''}};
window.addEventListener('pagehide',()=>{searchController?.abort();linesController?.abort();if(current&&episode?.kind!=='embed'&&episode)store.remember(current,episode.key,player.resumePosition(),episode);finishAttempt(true)});
if('serviceWorker'in navigator&&!import.meta.env.DEV&&location.protocol!=='app:'&&!window.streamdeskClient)navigator.serviceWorker.register('/sw.js').catch(()=>toast('离线外壳注册失败'));
// Test harness uses the real application path and media element; no simulated playback success.
Object.assign(window,{streamdesk:{open:openFilm,player,get searchProgress(){return searchProgress},get current(){return current},get episode(){return episode},get candidates(){return candidates},get metrics(){return player.snapshot()},get sources(){return sources},get displayed(){return displayed},get filters(){return filters}}});


$<HTMLSelectElement>('#enhancement').onchange=e=>{const mode=(e.target as HTMLSelectElement).value as import('../shared/enhancement-policy').EnhancementMode;player.enhancement.setMode(mode);try{localStorage.setItem('sd:enhancement',mode)}catch{}if(mode==='off')$('#enhancement-status').textContent='增强已完全关闭 · 原画'};
try{const saved=localStorage.getItem('sd:enhancement');if(saved&&['off','lite','balanced','anime','auto'].includes(saved)){$<HTMLSelectElement>('#enhancement').value=saved;player.enhancement.setMode(saved as import('../shared/enhancement-policy').EnhancementMode)}}catch{}
async function probeLines(signal:AbortSignal,epoch:number){
 const active=episode?.url;const pending=candidates.filter(c=>c.episode.kind!=='embed'&&c.episode.url!==active).slice(0,3);
 const work=poolMap(pending,1,async c=>{const cached=probeCache.get(c.episode.url);if(cached&&Date.now()-cached.checkedAt<60000){c.probe=cached;renderLines();return}if(signal.aborted||epoch!==linesEpoch)return;
 const p=await probeMedia(c.episode,AbortSignal.any([signal,AbortSignal.timeout(5000)]));if(signal.aborted||epoch!==linesEpoch)return;probeCache.set(c.episode.url,p);if(probeCache.size>100)probeCache.delete(probeCache.keys().next().value!);c.probe=p;renderLines();});probing=work;
 try{await work}finally{if(probing===work)probing=null}
}
$('#enhance-fullscreen').onclick=()=>{const wrapper=$('.video-wrap');if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else if(wrapper.requestFullscreen)void wrapper.requestFullscreen().catch(()=>toast('当前浏览器无法启用增强全屏'));else toast('可使用原生播放器全屏，增强暂时回退原画')};
bindVideoGestures($('.video-wrap'),$<HTMLVideoElement>('#video'),$('#gesture-hint'));
bindVideoKeyboard(player.video,()=>!$('#watch').hidden&&episode?.kind!=='embed',holding=>{$('#gesture-hint').hidden=!holding;$('#gesture-hint').textContent=holding?'2× 倍速播放':''});
bindCasting(()=>({film:current,episode,position:player.resumePosition()}),()=>player.video.pause(),toast);
$('#speed').onchange=e=>player.video.playbackRate=Number((e.target as HTMLSelectElement).value);
$('#load-more').onclick=()=>{const count=filterFilms(films,filters).length;resultLimit+=48;if(displayed.length<count)renderResults();else void browse()};$('#more-discover').onclick=()=>{batchOffset=0;filters.category='电影';document.querySelector<HTMLElement>('[data-category="电影"]')?.click()};$('#refresh').onclick=()=>{const count=filterFilms(films,filters).length;if(batchOffset+18<count){batchOffset+=18;resetCards();renderResults()}else void browse().then(()=>{batchOffset=count>18?count-18:0;resetCards();renderResults()})};
new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!isSearch&&browseHasMore&&!browseBusy&&view==='discover'&&$('#watch').hidden&&films.length>0&&filters.category!=='推荐'&&displayed.length<24)void browse()},{rootMargin:'300px'}).observe($('#load-sentinel'));
let downloadController:AbortController|null=null;$('#download-video').onclick=()=>{if(downloadController){downloadController.abort();return}if(!current||!episode)return;downloadController=new AbortController();$('#download-video').textContent='取消下载';void saveDownload(current,episode,s=>$('#play-status').textContent=s,downloadController.signal).then(()=>toast('本集已下载，可在我的下载中观看')).catch(e=>toast(String(e))).finally(()=>{downloadController=null;$('#download-video').textContent='下载本集'})};
async function openDownloaded(index:number){const d=downloads()[index];if(!d)return;finishAttempt(true);player.stop();++detailRun;linesController?.abort();current={...d.film,episodes:[d.episode]};episode=d.episode;candidates=[];switches=0;$('#watch').hidden=false;$('.app-header').hidden=true;$('#library-view').hidden=true;$('.bottom-nav').hidden=true;$('#description').textContent='已下载 · 离线观看';$('#lines').innerHTML='';const history=store.history.find(h=>store.matches(h.film,d.film));await playEpisode(d.episode,history?.position||0)}

void import('./account').then(({bindAccount})=>bindAccount(()=>{renderSources();if(['history','favorites','my'].includes(view))navigate(view)}));

try{const config=await api('/api/sources');sources=config.sources;renderSources();if(sources.some(s=>s.enabled&&s.type==='applecms'))await browse(true);else await search()}catch(e){$('#search-status').textContent=String(e)}


