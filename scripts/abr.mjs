import fs from 'node:fs/promises';
import {launchBrowser,base} from './browser.mjs';
const browser=await launchBrowser(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage(),out={at:new Date().toISOString(),controlledNetwork:true,steps:[],levels:[],ok:false};
try{
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.streamdesk.sources.length>0);await page.evaluate(mode=>{const b=document.querySelector('#auto-switch');b.checked=false;b.dispatchEvent(new Event('change'));if(mode)window.streamdesk.player.enhancement.setMode(mode)},process.env.ENHANCEMENT);const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:50,downloadThroughput:125000,uploadThroughput:125000});
 await page.evaluate(async()=>{const d=await fetch('/api/detail?source=open-hls&id=bbb').then(r=>r.json());void window.streamdesk.open(d.film)});
 await page.waitForFunction(()=>window.streamdesk.metrics.firstFrameMs!==null,{},{timeout:24000});
 await page.evaluate(()=>{window.__levels=[];window.streamdesk.player.hls.on('hlsLevelSwitched',(_e,d)=>window.__levels.push({level:d.level,time:document.querySelector('video').currentTime}));});
 await page.waitForTimeout(5000);out.steps.push(await page.evaluate(()=>({phase:'1 Mbps simulated link',level:window.streamdesk.player.hls.currentLevel,auto:window.streamdesk.player.hls.autoLevelEnabled,buffer:window.streamdesk.player.bufferSeconds(),time:document.querySelector('video').currentTime})));
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:5*1024*1024,uploadThroughput:5*1024*1024});
 await page.waitForFunction(()=>window.streamdesk.player.hls?.currentLevel>0,{},{timeout:35000}).catch(()=>{});out.steps.push(await page.evaluate(()=>({phase:'40 Mbps simulated link ceiling',level:window.streamdesk.player.hls.currentLevel,auto:window.streamdesk.player.hls.autoLevelEnabled,buffer:window.streamdesk.player.bufferSeconds(),time:document.querySelector('video').currentTime})));
 out.levels=await page.evaluate(()=>window.__levels);out.ok=out.steps.every(s=>s.auto)&&out.steps[1].time>out.steps[0].time+4;out.levelCount=await page.evaluate(()=>window.streamdesk.player.hls?.levels.length||0);out.observedLevelChange=new Set([...out.steps.map(s=>s.level),...out.levels.map(s=>s.level)]).size>1;out.ok=out.ok&&out.levelCount>1&&out.observedLevelChange;if(!out.ok)process.exitCode=1;
}catch(e){out.error=e.message}finally{await fs.writeFile(process.env.ABR_REPORT||'reports/abr.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));await browser.close()}
