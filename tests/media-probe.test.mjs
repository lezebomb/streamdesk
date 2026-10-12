import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeMedia} from '../shared/media-probe.ts';
import {candidateScore,uniqueCandidates} from '../shared/source-candidates.ts';
const ep={key:'feature',label:'正片',kind:'hls',url:'https://example.com/master.m3u8'};
test('real media check follows variant, validates init and rejects HTML segments',async()=>{
 const calls=[];const bodies=['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360\nv.m3u8','#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg.m4s',new Uint8Array(64),'<!doctype html><html>upstream error page</html>'];
 const result=await probeMedia(ep,AbortSignal.timeout(1000),async u=>{calls.push(u);return new Response(bodies.shift())});assert.equal(result.ok,false);assert.equal(result.stage,'segment');assert.equal(calls.length,4);assert.equal(result.height,360);
});
test('HTTP failure and abort do not count as decoded success',async()=>{
 const r=await probeMedia(ep,AbortSignal.timeout(1000),async()=>new Response('blocked',{status:403}));assert.equal(r.ok,false);assert.equal(r.status,403);
 const c=new AbortController();c.abort();let called=false;const a=await probeMedia(ep,c.signal,async()=>{called=true;return new Response('')});assert.equal(a.ok,false);assert.equal(called,false);
});
test('ranking distinguishes segment verification, API-only and duplicate mirrors',()=>{
 const a={film:{sourceId:'a'},episode:ep},b={film:{sourceId:'b'},episode:{...ep,url:'https://b.example/master.m3u8'},probe:{ok:true,ms:500,checkedAt:Date.now(),segmentHost:'b.example'}};
 assert.ok(candidateScore(b,{})>candidateScore(a,{}));assert.equal(uniqueCandidates([a,{...a,film:{sourceId:'mirror'}},b]).length,2);
 assert.ok(candidateScore({...b,probe:{...b.probe,ok:false}},{})<candidateScore(a,{}));
});
