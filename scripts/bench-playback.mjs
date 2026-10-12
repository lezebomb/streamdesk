import fs from 'node:fs/promises';
import os from 'node:os';
import {launchBrowser,base} from './browser.mjs';
const browser=await launchBrowser(),cases=[],at=new Date().toISOString();
const rounds=Number(process.env.ROUNDS||2),watchSeconds=Number(process.env.WATCH_SECONDS||12);
let plan;try{plan=JSON.parse(await fs.readFile('reports/test-plan.json','utf8'))}catch{plan=['bbb','sintel','tos'].flatMap(id=>['open-hls','open-mp4'].map(source=>({id,source})))}
try{
 for(const {id,source} of plan)for(let round=1;round<=rounds;round++){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage(),failures=[],consoleErrors=[];
  page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));page.on('pageerror',e=>consoleErrors.push(e.message));
  const test={id,source,round,success:false,firstFrameMs:null,metrics:null,seekMs:null,failures,consoleErrors};
  try{
   await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.streamdesk?.sources?.length>0);
   await page.evaluate(()=>{const box=document.querySelector('#auto-switch');box.checked=false;box.dispatchEvent(new Event('change'))}); // isolate source; control is hidden before selection
   await page.evaluate(async({id,source})=>{const r=await fetch(`/api/detail?source=${source}&id=${id}`);const d=await r.json();window.__testApiMs=d.ms;void window.streamdesk.open(d.film)},{id,source});
   await page.waitForFunction(()=>window.streamdesk?.metrics.firstFrameMs!==null||/媒体错误|来源返回|没有可|获取.*失败/.test(document.querySelector('#play-status').textContent),{},{timeout:25000});
   if(await page.evaluate(()=>window.streamdesk.metrics.firstFrameMs===null))throw new Error(await page.locator('#play-status').textContent());
   const initial=await page.evaluate(()=>({time:document.querySelector('video').currentTime,first:window.streamdesk.metrics.firstFrameMs}));test.firstFrameMs=initial.first;
   await page.waitForTimeout(watchSeconds*1000);
   const before=await page.evaluate(()=>({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused,metrics:window.streamdesk.metrics}));
   if(before.time<initial.time+Math.min(4,watchSeconds*.6))throw new Error('Decoded first frame but playback did not advance sufficiently');
   const seekPlan=await page.evaluate(()=>{const v=document.querySelector('video'),ends=Array.from({length:v.buffered.length},(_,i)=>v.buffered.end(i)),bufferEnd=Math.max(0,...ends),target=Math.min(v.duration-8,Math.max(60,bufferEnd+30)),previousSeekCount=window.streamdesk.metrics.seekMs.length;const scope=ends.some((end,i)=>v.buffered.start(i)<=target&&end>=target)?'buffered':'unbuffered';v.currentTime=target;return {target,scope,bufferEnd,previousSeekCount}});test.seekPlan=seekPlan;
   await page.waitForFunction(previous=>window.streamdesk.metrics.seekMs.length>previous,seekPlan.previousSeekCount,{timeout:16000});
   await page.waitForTimeout(4000);
   const data=await page.evaluate(()=>({metrics:window.streamdesk.metrics,apiMs:window.__testApiMs,time:document.querySelector('video').currentTime,duration:document.querySelector('video').duration,levels:window.streamdesk.player.qualityLevels(),buffer:window.streamdesk.player.bufferSeconds(),codec:document.querySelector('video').getVideoPlaybackQuality?.()}));
   Object.assign(test,data,{seekMs:data.metrics.seekMs.at(-1),success:data.time>seekPlan.target+1&&data.metrics.errors.filter(e=>e.type==='native').length===0});
  }catch(e){test.error=e.message;try{test.metrics=await page.evaluate(()=>window.streamdesk?.metrics);test.playerStatus=await page.locator('#play-status').textContent()}catch{}}
  cases.push(test);await fs.writeFile('reports/playback.json',JSON.stringify({at,environment:{browser:browser.version(),headless:true,os:os.platform(),node:process.version,concurrency:1,rounds,watchSeconds,startupTimeoutMs:25000,seekTimeoutMs:16000,autoplay:true,failover:false},cases},null,2));
  console.log(JSON.stringify({id,source,round,success:test.success,firstFrameMs:test.firstFrameMs,seekMs:test.seekMs,stalls:test.metrics?.stalls,error:test.error}));
  await context.close();
 }
}finally{await browser.close()}
