import {test} from 'node:test';import assert from 'node:assert/strict';
import {createFrameXAdapter,frameXApi,frameXRequestUrl,frameXEmbedUrl,frameXProviders} from '../shared/framextv.ts';
import {relevance,searchTerms} from '../shared/search-relevance.ts';import {sameFilm,matchEpisode} from '../shared/policy.ts';
import {EmbedPlayer,frameXProgress,embedStartUrl} from '../src/embed-player.ts';
const source={id:'framextv',name:'FrameXTV',type:'framextv',api:frameXApi,enabled:true},signal=()=>AbortSignal.timeout(1000);
const show={success:true,id:'42',type:'tv',title:'A Foreign Series',year:'2016',seasons:[{number:1,air_date:'2016-01-01'},{number:4,air_date:'2022-05-27'},{number:5,air_date:'2099-01-01'}]};
test('multilingual search keeps requested and related seasons without inventing translated aliases or ratings',async()=>{
 const calls=[],a=createFrameXAdapter(async(s,p)=>{calls.push(p);return p._endpoint==='search'?{success:true,list:[],results:[{...show,seasons:undefined}]}:{...show,list:[]}});
 const out=await a.search(source,'怪奇物语4',signal());assert.equal(out[0].season,4);assert.deepEqual(out.map(f=>f.season),[4,1]);assert.equal(out[0].year,'2022');assert.equal(relevance(out[0],'怪奇物语4'),1125);assert.equal(relevance(out[0],'其他影片'),0);assert.equal(out[0].sourceRating,undefined);assert.equal(out[0].doubanRating,undefined);assert.equal(calls[0].q,'怪奇物语');assert.equal(calls.length,2);assert.equal(sameFilm(out[0],{...out[0],season:1}),false);
});
test('embed groups retain exact episode and season, exclude future episodes and never claim media URLs',async()=>{
 const a=createFrameXAdapter(async(s,p)=>p._endpoint==='details'?{...show,list:[]}:{success:true,number:4,list:[],episodes:[{number:1,season_number:4,air_date:'2022-05-27'},{number:2,season_number:4,air_date:'2099-01-01'},{number:3,season_number:3,air_date:'2022-01-01'}]});
 const f=await a.detail(source,'tv:42:s4',signal());assert.equal(f.episodes.length,1);assert.equal(f.groups.length,frameXProviders.length);for(const g of f.groups){const e=g.episodes[0];assert.equal(e.kind,'embed');assert.equal(e.season,4);assert.equal(e.number,1);assert.equal(matchEpisode(f.episodes[0],g.episodes),e);assert.match(e.url,/\/embed\/42\/4\/1\?/)}assert.equal(f.year,'2022');
 await assert.rejects(()=>a.detail(source,'tv:42:s3',signal()),/该季/);await assert.rejects(()=>a.detail(source,'movie:43',signal()),/身份/);
});
test('only observed metadata routes and provider IDs are accepted; media resolution is not exposed',()=>{
 assert.equal(frameXRequestUrl(source,{_endpoint:'season',id:'42',season:'4'}).pathname,'/api/season');assert.throws(()=>frameXRequestUrl(source,{_endpoint:'stream'}));assert.throws(()=>frameXRequestUrl({...source,api:'http://localhost/api/search'},{}));assert.throws(()=>frameXEmbedUrl('42',4,1,'made-up'));assert.throws(()=>frameXEmbedUrl('42',4,0));assert.equal(new URL(frameXEmbedUrl('42',4,1,'miner',125)).searchParams.get('t'),'125');assert.ok(searchTerms('生化危机爆发夜').includes('生化危机'));
});
test('embed progress rejects wrong origin, wrong window, malformed and out of range messages',()=>{
 const contentWindow={},frame={contentWindow},event={source:contentWindow,origin:'https://framextv.xyz',data:{event:'frameXTV:timeupdate',currentTime:120,duration:1000}};assert.deepEqual(frameXProgress(event,frame),{position:120,duration:1000});for(const e of [{...event,source:{}},{...event,origin:'https://evil.example'},{...event,data:{...event.data,currentTime:NaN}},{...event,data:{...event.data,currentTime:10000}},{...event,data:{...event.data,duration:0}}])assert.equal(frameXProgress(e,frame),undefined);assert.equal(new URL(embedStartUrl('https://framextv.xyz/embed/42?provider=miner',90)).searchParams.get('t'),'90');assert.equal(embedStartUrl('https://example.org/embed/42',90),'https://example.org/embed/42');
});
test('a conflicting upstream saved position cannot overwrite history before SDK resume is acknowledged',()=>{
 const savedWindow=globalThis.window,savedDocument=globalThis.document,listeners=new Set(),commands=[],progress=[];
 const makeFrame=()=>({contentWindow:{postMessage:(data,origin)=>commands.push({data,origin})},cloneNode:()=>makeFrame(),replaceWith(next){frame=next},removeAttribute(){}});let frame=makeFrame();
 globalThis.window={addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn),dispatchEvent:()=>{}};globalThis.document={querySelector:()=>frame};
 const p=new EmbedPlayer(()=>{},position=>progress.push(position));const send=position=>{for(const receive of listeners)receive({source:frame.contentWindow,origin:'https://framextv.xyz',data:{event:'frameXTV:timeupdate',currentTime:position,duration:1000}})};
 try{p.load({kind:'embed',url:'https://framextv.xyz/embed/42'},120);send(0);send(1);assert.deepEqual(progress,[]);assert.equal(p.position,120);assert.equal(commands.length,1);assert.deepEqual(commands[0],{origin:'https://framextv.xyz',data:{action:'seek',time:120}});send(120.5);send(40);assert.deepEqual(progress,[120.5,40]);assert.equal(p.position,40);p.stop();assert.equal(listeners.size,0)}finally{p.stop();globalThis.window=savedWindow;globalThis.document=savedDocument}
});
