import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cmsFilm} from '../shared/cms.ts';
import {sameFilm,matchEpisode} from '../shared/policy.ts';
import {searchAll,adapters} from '../server/adapters.mjs';
import {consumeSearch} from '../shared/search.ts';
import {playbackPolicy} from '../shared/playback-policy.ts';

test('CMS retains all media groups and reports unsupported pages without guessing URLs',()=>{
 const f=cmsFilm({vod_id:1,vod_name:'剧第一季',type_name:'国产剧',vod_play_from:'page$$$hlsA$$$hlsB',vod_play_url:'第01集$https://example.com/player/1$$$第01集$https://a.example/1.m3u8#第02集$https://a.example/2.m3u8$$$第01集$https://b.example/1.m3u8?token=sample'},'fixture');
 assert.equal(f.groups.length,3);assert.equal(f.groups[0].unsupported,1);assert.equal(f.episodes.length,2);assert.equal(f.groups[2].episodes.length,1);assert.equal(matchEpisode(f.episodes[0],f.groups[2].episodes).key,'season:1:episode:1');
});
test('canonical ID never overrides year or season conflicts',()=>{const a={title:'剧第二季',year:'2024',category:'电视剧',canonicalId:'fixture:1'};assert.equal(sameFilm(a,{...a,title:'剧第一季'}),false);assert.equal(sameFilm(a,{...a,year:'2023'}),false);assert.equal(sameFilm(a,{...a,title:'剧 Season 2'}),true);assert.equal(sameFilm(a,{...a,title:'剧'}),false)});
test('split episodes cannot fall back to the other half or an unsplit episode',()=>{const upper={key:'episode:1:part:上',number:1,part:'上',label:'第01集上'};assert.equal(matchEpisode(upper,[{...upper,key:'episode:1:part:下',part:'下',label:'第01集下'}]),undefined);assert.equal(matchEpisode(upper,[{key:'episode:1',number:1,label:'第1集'}]),undefined)});
test('source rows arrive before slow sources and cancellation skips queued requests',async()=>{
 const finished=[];adapters.set('fixture',{search:async s=>{await new Promise(r=>setTimeout(r,s.delay));return []}});
 const promise=searchAll([{id:'slow',type:'fixture',enabled:true,delay:50},{id:'fast',type:'fixture',enabled:true,delay:5}],'q',new AbortController().signal,r=>finished.push(r.sourceId));
 await new Promise(r=>setTimeout(r,20));assert.deepEqual(finished,['fast']);await promise;assert.deepEqual(finished,['fast','slow']);
 const controller=new AbortController();controller.abort();const rows=await searchAll([{id:'unused',type:'fixture',enabled:true}], 'q',controller.signal);assert.equal(rows[0].ok,false);adapters.delete('fixture');
});
test('progressive search decodes split multibyte characters and rejects truncated streams',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify({type:'source',row:{sourceId:'x',ok:true,ms:1,list:[{title:'影视'}]}})+'\n{"type":"done","ms":2}\n');
 const body=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close()}}),events=[];await consumeSearch(new Response(body),e=>events.push(e));assert.equal(events[0].row.list[0].title,'影视');assert.equal(events[1].type,'done');await assert.rejects(()=>consumeSearch(new Response('{"type":"start","total":1}\n'),()=>{}),/提前结束/);
});
test('device/network policy stays bounded and permits real manual UHD levels',()=>{const p=playbackPolicy({memoryGB:2,saveData:true,downlinkMbps:.2,rttMs:1500});assert.equal(p.profile,'constrained');assert.ok(p.maxBufferBytes<30e6);assert.equal(p.startupDeadlineMs,30000);assert.equal(p.bandwidthEstimate,150000)});
