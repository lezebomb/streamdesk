import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {ratingMatch,attachRating,displayRating,verifiedRating} from '../shared/ratings.ts';import {parseRankingHTML,parseSubjectHTML} from '../shared/metadata-html.ts';import {metadataCatalogue} from '../server/metadata-catalogue.mjs';import {createNetworkPool} from '../server/network-pool.mjs';
const base={id:'1',sourceId:'s',title:'怪奇物语第四季',year:'2022',category:'电视剧',season:4,canonicalId:'douban:123',episodes:[]};
const meta={...base,id:'123',sourceId:'metadata',metadataVerifiedAt:1000,doubanRating:{score:8.8,subjectId:'123',checkedAt:1000,identity:{title:base.title,year:'2022',category:'电视剧',season:4}}};
test('rating identity validates title, year, season and type even with the same claimed ID',()=>{
 assert.ok(ratingMatch({...base,title:'怪奇物语4'},meta));
 for(const change of [{title:'另一部剧第四季'},{year:'2019'},{season:1},{category:'电影'},{year:undefined},{category:undefined}])assert.equal(ratingMatch({...base,...change},meta),false);
 assert.equal(ratingMatch({...base,title:'怪奇物语',season:undefined},meta),false);
 assert.equal(ratingMatch({...base,canonicalId:'douban:456'},meta),false);
 assert.equal(verifiedRating({...base,title:'另一部剧',doubanRating:meta.doubanRating}),undefined);
});
test('verified and provider claims remain separate and cache provenance remains visible',()=>{
 const f={...base,sourceRating:{score:9.9,providerId:'s',observedAt:900,claimedSubjectId:'123'}};
 const merged=attachRating(f,meta);assert.equal(merged.sourceRating.score,9.9);assert.equal(merged.doubanRating.score,8.8);
 assert.match(displayRating(f).label,/未核验/);assert.match(displayRating(merged,10*86400000).label,/缓存/);assert.match(displayRating({...base,doubanScore:9.8}).label,/未核验/);
 assert.equal(attachRating({...f,year:'2016'},meta).doubanRating,undefined);
});
const ranked='<ol class="grid_view"><li><div class="info"><div class="hd"><a href="https://movie.douban.com/subject/123/"><span class="title">测试电影</span></a></div><div class="bd"><p>导演 A<br>1994 / 美国 / 剧情 犯罪</p><div class="star"><span class="rating_num">9.7</span><span>12345 人评价</span></div></div></div></li></ol>';
test('public-page parser preserves verified facts and refuses incomplete/cross-subject identity',()=>{
 const f=parseRankingHTML(ranked,'https://movie.douban.com/top250',Date.UTC(2026,9,13)).films[0];assert.equal(f.doubanRating.votes,12345);assert.equal(f.sourceRating,undefined);assert.deepEqual(f.genres,['剧情','犯罪']);
 const html='<meta property="og:url" content="https://movie.douban.com/subject/123/"><span property="v:itemreviewed">怪奇物语第四季 Stranger Things</span><span class="year">(2022)</span><script type="application/ld+json">{"@type":"TVSeries","aggregateRating":{"ratingValue":8.8}}</script><div id="info">集数: 9<br>语言: 英语</div>';
 assert.equal(parseSubjectHTML(html,'123').season,4);assert.equal(parseSubjectHTML(html,'456'),undefined);assert.equal(parseSubjectHTML('<h1>请稍后再试</h1>','123'),undefined);
});
test('directory query performs zero network requests; rating failure uses labeled verified cache',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sd-rating-')),file=path.join(dir,'cache.json');let calls=0;
 await fs.writeFile(file,JSON.stringify({schema:2,films:[meta]}));const c=metadataCatalogue(file,{now:()=>10*86400000,transport:async()=>{calls++;throw Error('目录 HTTP 429')}});
 await c.query({category:'电视剧',genre:[],language:'全部',year:'全部',sort:'score'});assert.equal(calls,0);
 assert.equal((await c.detail('123')).doubanRating.score,8.8);assert.equal((await c.detail('456')),undefined);assert.equal(calls,1);assert.match(displayRating(await c.cached('123'),10*86400000).label,/缓存/);
 await fs.rm(file);await fs.rmdir(dir);
});
test('slow metadata leaves foreground slots free and queued cancellation is immediate',async()=>{
 const slot=createNetworkPool(),events=[];let release;const held=slot(()=>new Promise(r=>release=r),undefined,{background:true});await new Promise(r=>setImmediate(r));
 const second=slot(()=>events.push('background'),undefined,{background:true});await slot(()=>events.push('search'));assert.deepEqual(events,['search']);
 const cancel=new AbortController(),queued=slot(()=>events.push('cancelled'),cancel.signal,{background:true});cancel.abort(Error('cancel'));await assert.rejects(queued,/cancel/);release();await held;await second;assert.deepEqual(events,['search','background']);
});
