import fs from 'node:fs/promises';
import os from 'node:os';
import {launchBrowser,base} from './browser.mjs';
const runDir=process.env.RUN_DIR||'reports/runs/coverage-2026-10-12';const watchSeconds=Number(process.env.WATCH_SECONDS||45);
let report={at:new Date().toISOString(),environment:{os:os.platform(),node:process.version,url:base,concurrency:1,watchSeconds,startupTimeoutMs:31000,seekTimeoutMs:21000,failover:false,serviceWorkers:'block',unreachablePolicy:'Do not repeatedly request media after preflight HTTP failure'},cases:[]};
if(process.env.RESUME==='1')try{report=JSON.parse(await fs.readFile(`${runDir}/playback.json`,'utf8'));report.resumedAt=new Date().toISOString();report.environment.unreachablePolicy='Do not repeatedly request media after preflight HTTP failure'}catch{}
await fs.mkdir(runDir,{recursive:true});const browser=await launchBrowser();report.environment.browser=browser.version();
const workCount=JSON.parse(await fs.readFile('data/acceptance-works.json','utf8')).length;
try{for(let index=1;index<=workCount;index++){
 if(process.env.ONLY_TITLES&&!process.env.ONLY_TITLES.split(',').includes(JSON.parse(await fs.readFile('data/acceptance-works.json','utf8'))[index-1].title))continue;
 let row;for(;;){try{row=JSON.parse(await fs.readFile(`${runDir}/work-${index}.json`,'utf8'));break}catch{await new Promise(r=>setTimeout(r,2000))}}
 if(!row.attempts.length){if(!report.cases.some(c=>c.index===index))report.cases.push({index,title:row.title,success:false,fault:'no_exact_metadata',attemptedPlayback:false});await fs.writeFile(`${runDir}/playback.json`,JSON.stringify(report,null,2));continue}
 for(const attempt of row.attempts)for(const [groupIndex,group]of attempt.groups.entries()){
  if(report.cases.some(c=>c.index===index&&c.sourceId===attempt.sourceId&&c.groupId===group.groupId))continue;
  if(!group.network.ok){report.cases.push({index,title:row.title,sourceId:attempt.sourceId,id:attempt.hit.id,groupId:group.groupId,episode:group.episode,networkPreflight:group.network,success:false,attemptedPlayback:false,fault:group.network.fault,error:'Preflight rejected actual media; browser decoding was not attempted'});await fs.writeFile(`${runDir}/playback.json`,JSON.stringify(report,null,2));continue}
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage();const evidence=`${runDir}/play-${index}-${attempt.sourceId}-${groupIndex+1}`;
  const test={index,title:row.title,sourceId:attempt.sourceId,id:attempt.hit.id,groupId:group.groupId,episode:group.episode,networkPreflight:group.network,success:false,attemptedPlayback:true,http:[],requestFailures:[],consoleErrors:[],samples:[]};
  page.on('response',r=>{if(/m3u8|\.ts(?:\?|$)|\.m4s(?:\?|$)|\.mp4(?:\?|$)/.test(r.url()))test.http.push({url:r.url(),status:r.status()})});
  page.on('requestfailed',r=>test.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));page.on('pageerror',e=>test.consoleErrors.push(e.message));
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.streamdesk?.sources.length>0);
   await page.evaluate(()=>{const b=document.querySelector('#auto-switch');b.checked=false;b.dispatchEvent(new Event('change'))});
   // Detail and first group use the actual UI path. Additional groups use the same Player core.
   if(groupIndex===0)await page.evaluate(f=>void window.streamdesk.open(f),attempt.hit);
   else await page.evaluate(e=>void window.streamdesk.player.load(e),group.episode);
   await page.waitForFunction(()=>window.streamdesk.metrics.firstFrameMs!==null||/媒体错误|来源返回|首帧加载超时|该来源没有|详情.*错误/.test(document.querySelector('#play-status').textContent),{},{timeout:31000});
   test.firstFrameMs=await page.evaluate(()=>window.streamdesk.metrics.firstFrameMs);
   if(test.firstFrameMs===null)throw new Error(await page.locator('#play-status').textContent());
   const initial=await page.evaluate(()=>document.querySelector('video').currentTime);
   await page.screenshot({path:evidence+'-first.png',fullPage:true});
   for(let elapsed=0;elapsed<watchSeconds;elapsed+=5){await page.waitForTimeout(Math.min(5,watchSeconds-elapsed)*1000);test.samples.push(await page.evaluate(()=>({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused,buffer:window.streamdesk.player.bufferSeconds(),metrics:window.streamdesk.metrics,quality:window.streamdesk.player.qualityState()})));if(test.samples.at(-1).paused&&!await page.evaluate(()=>document.querySelector('video').ended))throw new Error('Playback unexpectedly paused')}
   const before=test.samples.at(-1);if(before.time-initial<watchSeconds*.75)throw new Error('Playback advance below 75% of wall time');
   test.seek=await page.evaluate(()=>{const v=document.querySelector('video'),end=Math.max(0,...Array.from({length:v.buffered.length},(_,i)=>v.buffered.end(i))),target=Math.min(v.duration-10,Math.max(90,end+30));v.currentTime=target;return {target,bufferEnd:end,scope:target>end?'unbuffered':'buffered'}});
   await page.waitForFunction(()=>window.streamdesk.metrics.seekMs.length>0||/超时|媒体错误|来源返回/.test(document.querySelector('#play-status').textContent),{},{timeout:21000});
   await page.waitForTimeout(6000);test.seekMs=await page.evaluate(()=>window.streamdesk.metrics.seekMs.at(-1));
   const final=await page.evaluate(()=>({metrics:window.streamdesk.metrics,time:document.querySelector('video').currentTime,duration:document.querySelector('video').duration,quality:window.streamdesk.player.qualityState(),levels:window.streamdesk.player.qualityLevels(),status:document.querySelector('#play-status').textContent}));Object.assign(test,final);
   test.success=test.seekMs!==undefined&&test.time>test.seek.target+2&&test.consoleErrors.length===0;
   if(!test.success)throw new Error('Seek did not resume real video frames');
   await page.screenshot({path:evidence+'-final.png',fullPage:true});
  }catch(e){test.error=e.message;try{test.metrics=await page.evaluate(()=>window.streamdesk.metrics);test.playerStatus=await page.locator('#play-status').textContent();await page.screenshot({path:evidence+'-failure.png',fullPage:true})}catch{}
   const failed=test.http.find(r=>r.status>=400);test.fault=failed?'source_http':test.metrics?.errors.some(e=>e.type==='native'&&/code=[34]/.test(e.details))?'decoder_or_format':test.consoleErrors.length?'player_application':test.requestFailures.some(r=>/CORS|ACCESS/.test(r.error||''))?'browser_access': 'network_or_source_unresolved';
  }
  await fs.writeFile(evidence+'.json',JSON.stringify(test,null,2));report.cases.push(test);await fs.writeFile(`${runDir}/playback.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({index,title:row.title,source:attempt.sourceId,success:test.success,firstFrameMs:test.firstFrameMs,seekMs:test.seekMs,error:test.error}));await context.close();
 }
}}finally{await browser.close()}
