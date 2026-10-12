import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {launchBrowser,base} from './browser.mjs';
const dir=process.env.RUN_DIR||'reports/evidence/enhancement-smoke';await fs.mkdir(dir,{recursive:true});
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),report={at:new Date().toISOString(),checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto(base);await page.waitForFunction(()=>window.streamdesk?.sources.length);
 const discovery=JSON.parse(await fs.readFile('reports/runs/expansion-discovery/discovery.json','utf8'));
 const sample=discovery.sources.find(x=>x.sourceId==='hongniu').samples.find(x=>x.title==='葬送的芙莉莲');
 await page.evaluate(f=>void window.streamdesk.open(f),sample.film);await page.waitForFunction(()=>window.streamdesk.metrics.firstFrameMs!==null,{},{timeout:31000});
 await page.selectOption('#enhancement','balanced');await page.waitForFunction(()=>window.streamdesk.player.enhancement.snapshot().frames>30,{},{timeout:15000});
 const on=await page.evaluate(()=>window.streamdesk.player.qualityState());assert.ok(on.enhancement.active);assert.equal(on.enhancement.mode,'balanced');assert.ok(on.enhancement.cpuSubmission.samples>0);report.checks.push({name:'real HLS frame texture + balanced shader',ok:true,state:on});await page.screenshot({path:dir+'/on.png',fullPage:true});
 await page.evaluate(()=>document.querySelector('video').pause());await page.waitForTimeout(100);
 await page.screenshot({path:dir+'/same-frame-on.png',fullPage:true});await page.selectOption('#enhancement','off');
 await page.screenshot({path:dir+'/same-frame-off.png',fullPage:true});const off=await page.evaluate(()=>({state:window.streamdesk.player.enhancement.snapshot(),canvases:document.querySelectorAll('.enhancement-canvas').length}));assert.equal(off.canvases,0);assert.equal(off.state.mode,'off');report.checks.push({name:'fully off releases canvas and GPU resources',ok:true,...off});
 await page.evaluate(()=>document.querySelector('video').play());await page.selectOption('#enhancement','anime');await page.waitForFunction(()=>window.streamdesk.player.enhancement.snapshot().frames>10);
 const seek=await page.evaluate(()=>{const p=window.streamdesk.player,v=p.video;const target=Math.max(90,...Array.from({length:v.buffered.length},(_,i)=>v.buffered.end(i)+30)),count=p.metrics.seekMs.length;v.currentTime=Math.min(v.duration-10,target);return {target:v.currentTime,count}});
 await page.waitForFunction(n=>window.streamdesk.metrics.seekMs.length>n,seek.count,{timeout:21000});await page.waitForTimeout(3000);const after=await page.evaluate(()=>({time:document.querySelector('video').currentTime,enhancement:window.streamdesk.player.enhancement.snapshot(),metrics:window.streamdesk.metrics}));assert.ok(after.time>seek.target+1);assert.ok(after.enhancement.frames>10);report.checks.push({name:'unbuffered seek preserves enhancement/video',ok:true,seek,...after});
 await page.selectOption('#enhancement','off');
}catch(e){report.error=e.message;process.exitCode=1;await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});report.failure=await page.evaluate(()=>({status:document.querySelector('#play-status').textContent,enhancement:window.streamdesk?.player.enhancement.snapshot()})).catch(()=>null)}finally{report.ok=!report.error&&report.errors.length===0;await fs.writeFile(dir+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close()}
