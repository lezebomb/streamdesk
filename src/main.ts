import './style.css';
import {Player} from './player';
import {store} from './storage';
import {blankHealth,observe,healthScore,sameFilm,matchEpisode,poolMap} from '../shared/policy';
import type {Film,Episode,Source,Metrics} from '../shared/model';
import {playbackGroups} from '../shared/cms';
import {consumeSearch} from '../shared/search';
import {resumeEpisode} from '../shared/library';
const $=<T extends HTMLElement=HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let sources:Source[]=[],films:Film[]=[],current:Film|null=null,episode:Episode|null=null,view='discover',switching=false,auto=true,searchRun=0,detailRun=0;
const attempted=new Set<string>();let attemptLogged=false;let switches=0;
let lastHistorySave=0;
function mediaHealthKey(f:Film,e:Episode){try{return `${f.sourceId}|${new URL(e.url).hostname}`}catch{return f.sourceId}}
$('#app').innerHTML=`
<aside class="sidebar"><a class="brand" href="/"><span class="brand-icon">▷</span><span>StreamDesk<small>个人影院</small></span></a><div class="nav-label">我的工作台</div><nav><button data-view="discover" class="active">⌕ <span>发现与搜索</span></button><button data-view="favorites">♡ <span>我的收藏</span><span id="fav-count" class="count"></span></button><button data-view="history">◷ <span>继续观看</span></button><button data-view="sources">☷ <span>来源管理</span></button></nav><div class="sidebar-note"><span class="online-dot"></span>本地 · 个人使用<small>记录保存在当前设备</small></div></aside>
<main><header><div><span class="eyebrow">YOUR PERSONAL SCREEN</span><h1 id="view-title">发现与搜索</h1></div><button id="install" class="subtle" hidden>安装应用 ↗</button><button id="sources-shortcut" class="subtle">来源设置 ⚙</button></header>
<section id="discover-view"><div class="intro"><div><span class="pill">播放体验优先</span><h2>找到影片，<br>接着看。</h2><p>多来源搜索 · 自动换源 · 记住播放位置</p></div><div class="intro-note"><span>READY WHEN YOU ARE</span><strong id="enabled-count">—</strong><small>个来源已启用</small></div></div><form id="search-form" class="search"><span>⌕</span><input id="query" placeholder="搜索片名，例如：Sintel" aria-label="搜索影片"><button class="primary">搜索全部来源 →</button></form><div class="section-heading"><h3 id="results-heading">公开测试片库</h3><span id="search-status">正在连接来源…</span></div><div id="results" class="grid"></div><div class="catalog-note">默认片库为公开测试电影。添加你有权使用的采集站 API 后，可搜索更多电影、电视剧与动漫。</div><div id="source-strip" class="source-strip"></div></section>
<section id="library-view" hidden><div id="library" class="grid"></div></section>
<section id="sources-view" hidden><div class="panel"><h2>来源配置</h2><p>插件类型：公开目录 / Apple CMS / Embed。单个来源失败会单独显示。</p><div id="source-list"></div><details><summary>编辑来源 JSON</summary><p>Apple CMS 配置包含 id、name、type: applecms、enabled、api。Embed 配置在 items 中提供影片与剧集的完整页面地址。</p><textarea id="source-json" aria-label="来源 JSON" spellcheck="false"></textarea><button id="save-sources" class="primary">保存来源配置</button></details><p id="config-status" role="status"></p><a href="https://framextv.xyz/docs" target="_blank" rel="noreferrer">FrameXTV 公开文档 ↗</a><p class="muted">Embed 播放由来源自己的播放器管理。本站不会把 iframe 加载成功视为视频播放成功；无法读取其播放进度、码率或缓冲状态。</p><button id="reset-health" class="subtle">重置健康评分</button></div><div class="panel"><h2>性能与验收</h2><p>API 响应速度和实际媒体表现分别记录。未经播放验证的来源显示「未验证」。</p><a href="/reports/performance.md" target="_blank">打开实测性能报告 ↗</a><button id="export-data" class="subtle">导出收藏与历史</button></div></section>
<section id="watch" class="watch" hidden><div class="watch-heading"><div><span class="eyebrow">NOW PLAYING</span><h2 id="film-title"></h2></div><button id="close-watch" class="subtle">关闭 ✕</button></div><div class="watch-layout"><div><div class="video-wrap"><video id="video" controls playsinline preload="metadata"></video><iframe id="embed" hidden title="来源嵌入播放器" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><div class="playbar"><span id="play-status" role="status">待播放</span><button id="favorite" class="subtle">♡ 收藏</button><label>画质 <select id="quality"><option value="-1">自动</option></select></label><label class="auto"><input type="checkbox" id="auto-switch" checked>自动换源</label></div><div id="metrics" class="metrics"></div><p id="description" class="muted"></p><details class="diagnostics"><summary>播放诊断</summary><pre id="diagnostic"></pre><button id="export-metrics" class="subtle">导出本次播放数据</button></details></div><aside class="episode-panel"><div class="section-heading"><h3>选集</h3><span id="episode-count"></span></div><div id="episodes" class="episodes"></div><h3>播放线路</h3><p class="muted">同片、同集的可用线路</p><div id="lines"></div><button id="find-lines" class="subtle">查找其他来源</button></aside></div></section>
<footer><span>StreamDesk / 个人影视工作台</span><span>开源核心：LibreTV + hls.js</span></footer></main><div id="toast" role="status" hidden></div>`;
let toastTimer:ReturnType<typeof setTimeout>;function toast(s:string){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4000)}
async function api(url:string,options:RequestInit={}){const r=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function updateHealth(id:string,event:Parameters<typeof observe>[1]){store.health[id]=observe(store.health[id]||blankHealth(),event);store.save();renderSources()}
function renderSources(){
 $('#enabled-count').textContent=String(sources.filter(s=>s.enabled).length);$('#fav-count').textContent=String(store.favorites.length);
 const badge=(s:Source)=>{const h=store.health[s.id];return !h||!h.playSamples?'暂无本设备播放记录':`健康 ${healthScore(h)} · 出画 ${h.startupMs===null?'—':(h.startupMs/1000).toFixed(2)+'s'}`};
 $('#source-strip').innerHTML=sources.map(s=>`<div><span class="${s.enabled?'online-dot':'offline-dot'}"></span><strong>${esc(s.name)}</strong><small>${esc(badge(s))}</small></div>`).join('');
 $('#source-list').innerHTML=sources.map(s=>`<div class="source-row"><div><strong>${esc(s.name)}</strong><small>${esc(s.type)} · ${esc(badge(s))}</small></div><label><input type="checkbox" data-source-toggle="${esc(s.id)}" ${s.enabled?'checked':''}>启用</label></div>`).join('');
}
function card(f:Film,index:number,library=false){const h=store.history.find(x=>store.matches(x.film,f));return `<button class="film-card" data-film="${index}" data-library="${library}"><div class="poster poster-${f.id.replace(/[^a-z0-9]/g,'').slice(0,15)}">${f.poster?`<img src="${esc(f.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<span class="poster-tag">${esc(f.category||'影片')}</span><span class="poster-art">${f.id==='bbb'?'◒':f.id==='sintel'?'△':'▥'}</span><span class="poster-title">${esc(f.title.split(' ').slice(1).join(' ')||f.title)}</span><span class="poster-play">▶</span></div><div class="card-info"><strong>${esc(f.title)}</strong><small>${esc(f.year||'年份未知')} <span>· ${esc(sources.find(s=>s.id===f.sourceId)?.name||f.sourceId)}</span></small>${h?`<small class="resume">看到 ${Math.floor(h.position/60)}:${String(Math.floor(h.position%60)).padStart(2,'0')} · ${esc(h.episodeKey==='feature'?'正片':h.episodeKey)}</small>`:''}</div></button>`}
function sourcePreference(id:string){const h=store.health[id]||blankHealth();return healthScore(h)+(h.playSamples?0:sources.find(s=>s.id===id)?.priority||0)}
function renderResults(){const unique:Film[]=[];for(const f of films){const i=unique.findIndex(x=>sameFilm(x,f));if(i<0)unique.push(f);else if(sourcePreference(f.sourceId)>sourcePreference(unique[i].sourceId))unique[i]=f}$('#results').innerHTML=unique.length?unique.map((f)=>card(f,films.indexOf(f))).join(''):'<div class="empty">没有找到影片。可换一个关键词，或在来源管理中添加接口。</div>'}
let libraryFilms:Film[]=[];
function navigate(v:string){view=v;for(const b of document.querySelectorAll<HTMLButtonElement>('[data-view]'))b.classList.toggle('active',b.dataset.view===v);$('#view-title').textContent=({discover:'发现与搜索',favorites:'我的收藏',history:'继续观看',sources:'来源管理'} as Record<string,string>)[v];$('#discover-view').hidden=v!=='discover';$('#library-view').hidden=!['favorites','history'].includes(v);$('#sources-view').hidden=v!=='sources';
 if(v==='sources')$<HTMLTextAreaElement>('#source-json').value=JSON.stringify(sources,null,2);
 if(['favorites','history'].includes(v)){libraryFilms=v==='favorites'?store.favorites:store.history.map(h=>h.film);$('#library').innerHTML=libraryFilms.length?libraryFilms.map((f,i)=>card(f,i,true)).join(''):'<div class="empty">这里还没有记录。选择影片开始观看吧。</div>'}
}
let searchController:AbortController|null=null;
async function search(q=''){
 const run=++searchRun;searchController?.abort();searchController=new AbortController();let finished=0,failed=0,total=0;films=[];
 $('#results-heading').textContent=q?`“${q}” 的搜索结果`:'公开测试片库';$('#results').innerHTML='<div class="empty">正在搜索…</div>';
 $('#search-status').textContent='正在搜索 · 并发上限 2';
 try{const r=await fetch('/api/search?stream=1&q='+encodeURIComponent(q),{signal:AbortSignal.any([searchController.signal,AbortSignal.timeout(23000)])});
  await consumeSearch(r,event=>{if(run!==searchRun)return;
   if(event.type==='start')total=event.total;
   if(event.type==='source'){finished++;if(!event.row.ok)failed++;films.push(...event.row.list);updateHealth(event.row.sourceId,{kind:'api',ok:event.row.ok,ms:event.row.ms});renderResults();$('#search-status').textContent=`${films.length} 条结果 · ${finished}/${total} 个来源已返回 · ${failed} 个失败`}
   if(event.type==='done')$('#search-status').textContent=`${films.length} 条结果 · ${failed} 个来源失败 · ${Math.round(event.ms)} ms`;
  });if(run===searchRun)renderResults();
 }catch(e){if(run!==searchRun)return;$('#search-status').textContent=`已显示 ${films.length} 条结果 · 搜索未完成：${String(e)}`;toast('部分搜索失败：'+String(e))}
}
let candidates:{film:Film;episode:Episode}[]=[];let findingLines:Promise<void>|null=null;let linesController:AbortController|null=null,linesEpoch=0;
function localLines(f:Film,e:Episode){return playbackGroups(f).flatMap(g=>{const ep=matchEpisode(e,g.episodes);return ep?[{film:f,episode:ep}]:[]})}
function activeEpisodes(){return current?playbackGroups(current).find(g=>g.id===episode?.groupId)?.episodes||current.episodes:[]}
async function openFilm(f:Film){const run=++detailRun;linesController?.abort();++linesEpoch;finishAttempt(true);player.stop();$('#embed').removeAttribute('src');current=null;episode=null;attempted.clear();switches=0;candidates=[];findingLines=null;$('#lines').innerHTML='';$('#episodes').innerHTML='';$('#quality').innerHTML='<option value="-1">自动 · ABR</option>';$('#watch').hidden=false;$('#watch').scrollIntoView({behavior:'smooth',block:'start'});$('#film-title').textContent=f.title;$('#play-status').textContent='正在获取详情…';
 try{const d=await api(`/api/detail?source=${encodeURIComponent(f.sourceId)}&id=${encodeURIComponent(f.id)}`);if(run!==detailRun)return;current=d.film;updateHealth(f.sourceId,{kind:'api',ok:true,ms:d.ms});if(!current!.episodes.length)throw new Error('该来源没有受支持的直接媒体地址；需要解析页面的资源尚未接入');$('#description').textContent=current!.description||'';const history=store.history.find(x=>store.matches(x.film,current!));episode=(history?resumeEpisode(history,current!):undefined)||current!.episodes[0];renderEpisodes();await playEpisode(episode,history&&resumeEpisode(history,current!)?.key===episode.key?history.position:0);await findLines();
 }catch(e){if(run===detailRun){$('#play-status').textContent=String(e);toast(String(e))}}
}
function renderEpisodes(){if(!current)return;const eps=activeEpisodes();$('#episode-count').textContent=String(eps.length);$('#episodes').innerHTML=eps.map((e,i)=>`<button data-episode="${i}" class="${e.key===episode?.key?'selected':''}">${esc(e.label)}</button>`).join('');$('#favorite').textContent=store.favorite(current)?'♥ 已收藏':'♡ 收藏';renderSources()}
function finishAttempt(ok:boolean){if(!current||!episode||attemptLogged||episode.kind==='embed')return;const m=player.snapshot();if(m.firstFrameMs===null&&ok)return;attemptLogged=true;const bandwidth=m.fragments.length?m.fragments.reduce((s,f)=>s+f.bytes,0)*8/m.fragments.reduce((s,f)=>s+f.ms,0)/1000:undefined;const observation={kind:'play' as const,ok,ms:m.firstFrameMs??undefined,mbps:bandwidth,stallMs:m.stallMs,watchMs:m.watchMs};updateHealth(current.sourceId,observation);updateHealth(mediaHealthKey(current,episode),observation)}
async function playEpisode(e:Episode,position=0){if(!current)return;finishAttempt(true);episode=e;attemptLogged=false;attempted.add(`${current.sourceId}|${e.url}`);$('#film-title').textContent=current.title;renderEpisodes();$('#video').hidden=e.kind==='embed';$('#embed').hidden=e.kind!=='embed';$('#embed').removeAttribute('src');
 $('#quality').innerHTML='<option value="-1">自动 · ABR</option>';qualitySignature='';
 if(e.kind==='embed'){player.stop();$('#embed').setAttribute('src',e.url);$('#play-status').textContent='嵌入模式 · 进度和性能由来源管理';$('#metrics').textContent='无法测量 iframe 内部的出画、卡顿和码率';$('#diagnostic').textContent='Embed 不参与自动换源、进度恢复或内部性能测量';}
 else await player.load(e,position,true,switches,store.health[mediaHealthKey(current,e)]?.mbps??undefined);
}
let qualitySignature='';
const player=new Player($('#video'),s=>$('#play-status').textContent=s,reason=>void failover(reason),m=>{
 $('#metrics').innerHTML=`<div><small>首次出画</small><strong>${m.firstFrameMs===null?'测量中':(m.firstFrameMs/1000).toFixed(2)+' s'}</strong></div><div><small>当前缓冲</small><strong>${player.bufferSeconds().toFixed(1)} s</strong></div><div><small>卡顿 / 时长</small><strong>${m.stalls} / ${(m.stallMs/1000).toFixed(1)} s</strong></div><div><small>分片吞吐</small><strong>${m.fragments.length?m.fragments.at(-1)!.mbps.toFixed(1)+' Mbps':'—'}</strong></div>`;
 const actual=player.qualityState();$('#diagnostic').textContent=JSON.stringify({...m,quality:actual,fragments:m.fragments.slice(-3),errors:m.errors.slice(-5),bufferSeconds:player.bufferSeconds()},null,2);
 $('#metrics').insertAdjacentHTML('beforeend',`<div><small>实际画面 / 呈现帧率</small><strong>${actual.width?actual.width+'×'+actual.height:'—'} · ${actual.presentedFps?.toFixed(1)||'—'} fps</strong></div><div><small>编码 / 清单码率</small><strong>${esc(actual.codec||'未知')} · ${actual.manifestBitrate?(actual.manifestBitrate/1e6).toFixed(1)+' Mbps':'未知'}</strong></div>`);
 const q=$<HTMLSelectElement>('#quality'),levels=player.qualityLevels(),signature=JSON.stringify(levels);if(signature!==qualitySignature){qualitySignature=signature;q.innerHTML='<option value="-1">自动 · ABR</option>'+levels.map(l=>`<option value="${l.i}">${esc(l.label)}</option>`).join('')}
 q.value=String(player.manualLevel);
 if(current&&episode&&m.firstFrameMs!==null&&Date.now()-lastHistorySave>=5000){lastHistorySave=Date.now();store.remember(current,episode.key,player.resumePosition(),episode)}
});
function renderLines(){const h=(c:{film:Film;episode:Episode})=>store.health[mediaHealthKey(c.film,c.episode)]||blankHealth();candidates.sort((a,b)=>healthScore(h(b))-healthScore(h(a)));$('#lines').innerHTML=candidates.map((c,i)=>`<button class="line ${c.film.sourceId===current?.sourceId&&c.episode.url===episode?.url?'selected':''}" data-line="${i}"><span>${esc(sources.find(s=>s.id===c.film.sourceId)?.name||c.film.sourceId)} · ${esc(c.film.groups?.find(g=>g.id===c.episode.groupId)?.name||'默认')}</span><small>${h(c).playSamples?'健康 '+healthScore(h(c)):'暂无播放记录'} · ${esc(c.episode.kind.toUpperCase())}</small></button>`).join('')||'<p class="muted">尚无同集备用线路</p>'}
function findLines(){if(findingLines)return findingLines;if(current&&episode){candidates=localLines(current,episode);renderLines()}const work=resolveLines();findingLines=work;void work.finally(()=>{if(findingLines===work)findingLines=null});return work}
async function resolveLines(){const f=current,e=episode,run=detailRun,epoch=++linesEpoch;if(!f||!e)return;linesController?.abort();const controller=linesController=new AbortController();$('#find-lines').textContent='正在匹配…';try{
 const d=await api('/api/search?q='+encodeURIComponent(f.title),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(23000)])});const hits:Film[]=d.rows.flatMap((r:{list:Film[]})=>r.list).filter((x:Film)=>sameFilm(x,f)&&!(x.sourceId===f.sourceId&&x.id===f.id));
 await poolMap(hits,2,async hit=>{try{if(controller.signal.aborted)return;const other=(await api(`/api/detail?source=${encodeURIComponent(hit.sourceId)}&id=${encodeURIComponent(hit.id)}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])})).film as Film;
  if(run!==detailRun||epoch!==linesEpoch||episode?.key!==e.key||!sameFilm(other,f))return;
  for(const c of localLines(other,e))if(!candidates.some(x=>x.film.sourceId===c.film.sourceId&&x.episode.url===c.episode.url))candidates.push(c);renderLines();
 }catch{/* One source must not discard other candidates. */}});
 }catch(err){if(!controller.signal.aborted&&run===detailRun)toast('查找线路失败：'+String(err))}finally{if(epoch===linesEpoch)$('#find-lines').textContent='查找其他来源'}
}
async function switchLine(c:{film:Film;episode:Episode},position:number){finishAttempt(true);current=c.film;switches++;await playEpisode(c.episode,position);$('#description').textContent=current.description||'';renderLines()}
async function failover(reason:string){if(switching||!current||!episode||episode.kind==='embed')return;finishAttempt(false);if(!auto){$('#play-status').textContent=reason+' · 自动换源已关闭';return}switching=true;try{
 const run=detailRun,failedFilm=current,failedUrl=episode.url;if(!candidates.some(c=>!attempted.has(`${c.film.sourceId}|${c.episode.url}`)))await findLines();if(run!==detailRun||current!==failedFilm||episode?.url!==failedUrl)return;
 if(!auto){$('#play-status').textContent=reason+' · 自动换源已关闭';return}
 const position=player.resumePosition();const next=candidates.find(c=>c.episode.kind!=='embed'&&!attempted.has(`${c.film.sourceId}|${c.episode.url}`)&&(store.health[mediaHealthKey(c.film,c.episode)]?.cooldownUntil||0)<=Date.now());
 if(!next){player.stop();$('#play-status').textContent=reason+' · 没有同集备用线路，请手动选择来源';return}toast('线路异常，正在保留进度换源');await switchLine(next,position);
 }finally{switching=false}}
document.addEventListener('click',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('button');if(!el)return;
 if(el.dataset.view)navigate(el.dataset.view);
 if(el.dataset.film!==undefined)void openFilm((el.dataset.library==='true'?libraryFilms:films)[Number(el.dataset.film)]);
 if(el.dataset.episode!==undefined&&current){const next=activeEpisodes()[Number(el.dataset.episode)];linesController?.abort();++linesEpoch;findingLines=null;candidates=[];attempted.clear();void playEpisode(next);void findLines()}
 if(el.dataset.line!==undefined){const position=episode?.kind==='embed'?0:player.resumePosition();attempted.clear();void switchLine(candidates[Number(el.dataset.line)],position)}
});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();void search($<HTMLInputElement>('#query').value.trim())});
$('#sources-shortcut').onclick=()=>navigate('sources');
$('#favorite').onclick=()=>{if(current){store.toggle(current);renderEpisodes()}};
$('#close-watch').onclick=()=>{++detailRun;linesController?.abort();++linesEpoch;if(current&&episode&&episode.kind!=='embed')store.remember(current,episode.key,player.resumePosition(),episode);finishAttempt(true);player.stop();$('#embed').removeAttribute('src');$('#watch').hidden=true;current=null;episode=null;if(view==='history')navigate(view)};
$('#find-lines').onclick=()=>void findLines();
$<HTMLInputElement>('#auto-switch').onchange=e=>auto=(e.target as HTMLInputElement).checked;
$<HTMLSelectElement>('#quality').onchange=e=>player.setQuality(Number((e.target as HTMLSelectElement).value));
function download(filename:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#export-data').onclick=()=>download('streamdesk-library.json',{...store.export(),sources});
$('#export-data').insertAdjacentHTML('afterend','<button id="import-data" class="subtle">导入收藏与历史</button><input id="import-file" type="file" accept="application/json,.json" hidden>');
$('#import-data').onclick=()=>$('#import-file').click();
$<HTMLInputElement>('#import-file').onchange=async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('备份超过 8 MiB');store.import(JSON.parse(await file.text()));renderSources();if(['favorites','history'].includes(view))navigate(view);toast('已导入收藏与历史；来源配置可在 JSON 编辑器恢复')}catch(error){toast('导入失败，原记录保留：'+String(error))}finally{input.value=''}};
$('#export-metrics').onclick=()=>download('streamdesk-playback.json',{at:new Date().toISOString(),film:current,episode,metrics:episode?.kind==='embed'?null:player.snapshot()});
$('#reset-health').onclick=()=>{store.health={};store.save();renderSources();toast('健康评分已重置')};
async function saveSources(next:Source[]){const d=await api('/api/sources',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:next})});sources=d.sources;$<HTMLTextAreaElement>('#source-json').value=JSON.stringify(sources,null,2);renderSources();await search($<HTMLInputElement>('#query').value.trim())}
$('#save-sources').onclick=async()=>{try{await saveSources(JSON.parse($<HTMLTextAreaElement>('#source-json').value));$('#config-status').textContent='已保存'}catch(e){$('#config-status').textContent=String(e)}};
$('#source-list').onchange=async e=>{const input=e.target as HTMLInputElement;const source=sources.find(s=>s.id===input.dataset.sourceToggle);if(!source)return;try{await saveSources(sources.map(s=>s.id===source.id?{...s,enabled:input.checked}:s))}catch(err){input.checked=source.enabled;toast(String(err))}};
window.addEventListener('pagehide',()=>{searchController?.abort();linesController?.abort();if(current&&episode?.kind!=='embed'&&episode)store.remember(current,episode.key,player.resumePosition(),episode);finishAttempt(true)});
let installEvent:Event&{prompt:()=>Promise<void>};window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e as typeof installEvent;$('#install').hidden=false});$('#install').onclick=()=>void installEvent?.prompt();
for(const button of document.querySelectorAll<HTMLButtonElement>('nav [data-view]'))button.setAttribute('aria-label',({discover:'发现与搜索',favorites:'我的收藏',history:'继续观看',sources:'来源管理'} as Record<string,string>)[button.dataset.view!]);
if('serviceWorker'in navigator&&!import.meta.env.DEV)navigator.serviceWorker.register('/sw.js').catch(()=>toast('离线外壳注册失败'));
// Test harness uses the real application path and media element; no simulated playback success.
Object.assign(window,{streamdesk:{open:openFilm,player,get current(){return current},get episode(){return episode},get candidates(){return candidates},get metrics(){return player.snapshot()},get sources(){return sources}}});
try{sources=(await api('/api/sources')).sources;renderSources();await search()}catch(e){$('#search-status').textContent=String(e)}
