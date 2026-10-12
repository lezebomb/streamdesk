import fs from 'node:fs/promises';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {launchBrowser,base} from './browser.mjs';
const exec=promisify(execFile),dir=process.env.RUN_DIR||'reports/runs/enhancement-0.3.0',seconds=Number(process.env.WATCH_SECONDS||45);await fs.mkdir(dir,{recursive:true});
const browser=await launchBrowser(),system=await browser.newBrowserCDPSession(),hardware=await system.send('SystemInfo.getInfo');
const discovery=JSON.parse(await fs.readFile('reports/runs/expansion-discovery/discovery.json','utf8')),hn=discovery.sources.find(x=>x.sourceId==='hongniu');
const samples=[{id:'low-animation',category:'动漫',episode:{key:'feature',label:'480p',kind:'hls',url:'https://test-streams.mux.dev/x36xhzz/url_6/193039199_mp4_h264_aac_hq_7.m3u8'}},
 {id:'live-action',category:'电视剧',episode:hn.samples.find(x=>x.title==='爱情公寓').film.episodes[0]},
 {id:'anime-1080',category:'动漫',episode:hn.samples.find(x=>x.title==='葬送的芙莉莲').film.episodes[0]}];
const selectedSamples=process.env.BENCH_SAMPLES?samples.filter(s=>process.env.BENCH_SAMPLES.split(',').includes(s.id)):samples;
const report={at:new Date().toISOString(),environment:{platform:os.platform(),cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,browser:browser.version(),gpu:hardware.gpu.devices,seconds,otherTraffic:'Source acceptance may be running; startup comparisons are descriptive single observations, not causal speedups',mobile:'No physical mobile hardware; responsive scenario only',metrics:'CPU from Chromium process cpuTime; working sets may count shared pages; GPU percent is max process engine, not whole GPU; NVIDIA temperature/power is a separate idle dGPU if renderer is Intel'},cases:[]};
async function processes(){const r=await system.send('SystemInfo.getProcessInfo');return r.processInfo}
async function hostMetrics(pids,gpuPid){
 if(process.platform!=='win32')return {memoryBytes:null,gpuEnginePercent:null,temperatureC:null,powerW:null};
 // IDs come only from this launched browser. Read-only process counters; no system settings.
 const counterPath=String.fromCharCode(92)+'GPU Engine(*)'+String.fromCharCode(92)+'Utilization Percentage';
 const script=`$ErrorActionPreference='SilentlyContinue'; $p=Get-Process -Id ${pids.join(',')}; $mem=($p|Measure-Object -Property WorkingSet64 -Sum).Sum; $g=Get-Counter -Counter '${counterPath}' -MaxSamples 1; $v=@($g.CounterSamples|Where-Object {$_.Status -eq 0 -and $_.InstanceName -match '^pid_(${pids.join('|')})_'}); $max=($v|Measure-Object -Property CookedValue -Maximum).Maximum; [pscustomobject]@{memoryBytes=$mem;gpuEnginePercent=$max;gpuEngines=@($v|Where-Object {$_.CookedValue -gt 0.01}|Select-Object InstanceName,CookedValue)}|ConvertTo-Json -Depth 3 -Compress`;
 const results={memoryBytes:null,gpuEnginePercent:null,temperatureC:null,powerW:null};
 try{const r=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:65536});Object.assign(results,JSON.parse(r.stdout.trim()))}catch(e){results.counterError=e.message}
 try{const r=await exec('nvidia-smi',['--query-gpu=name,utilization.gpu,temperature.gpu,power.draw','--format=csv,noheader,nounits'],{windowsHide:true,timeout:3000});results.nvidia=r.stdout.trim();}catch{results.nvidia=null}
 return results;
}
try{for(const sample of selectedSamples)for(const mode of ['off',sample.id==='low-animation'?'lite':sample.category==='动漫'?'anime':'balanced']){
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),page=await context.newPage(),test={sample:sample.id,mode,success:false,errors:[],httpFailures:[],samples:[]};report.cases.push(test);page.on('pageerror',e=>test.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.m3u8|\.ts|\.mp4/.test(r.url()))test.httpFailures.push({url:r.url(),status:r.status()})});
 try{await page.goto(base);await page.waitForFunction(()=>window.streamdesk?.sources.length);await page.evaluate(()=>document.querySelector('#watch').hidden=false);await page.locator('.video-wrap').scrollIntoViewIfNeeded();await page.selectOption('#enhancement',mode);await page.mouse.move(5,5);test.visibleBounds=await page.locator('.video-wrap').boundingBox();if(test.visibleBounds.y<0||test.visibleBounds.y+test.visibleBounds.height>900)throw new Error('Video is not fully visible for presentation metrics');await page.evaluate(({sample})=>{const p=window.streamdesk.player;p.contentAnime=sample.category==='动漫';void p.load(sample.episode)}, {sample});
 await page.waitForFunction(()=>window.streamdesk.metrics.firstFrameMs!==null,{},{timeout:31000});test.firstFrameMs=await page.evaluate(()=>window.streamdesk.metrics.firstFrameMs);const start=await page.evaluate(()=>document.querySelector('video').currentTime),at=performance.now(),before=await processes(),gpu=before.find(p=>/gpu/i.test(p.type));
 while(performance.now()-at<seconds*1000){await page.waitForTimeout(5000);const procs=await processes(),pids=procs.map(p=>p.id),host=await hostMetrics(pids,gpu?.id);test.samples.push({atMs:performance.now()-at,host,video:await page.evaluate(()=>({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused,frames:{total:document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames,dropped:document.querySelector('video').getVideoPlaybackQuality().droppedVideoFrames},metrics:window.streamdesk.metrics,quality:window.streamdesk.player.qualityState()}))});}
 const after=await processes(),wall=(performance.now()-at)/1000,cpuDelta=after.reduce((s,p)=>s+Math.max(0,p.cpuTime-(before.find(b=>b.id===p.id)?.cpuTime||p.cpuTime)),0);test.cpuOneCorePercent=cpuDelta/wall*100;test.cpuMachinePercent=test.cpuOneCorePercent/os.cpus().length;test.observedSeconds=wall;test.final=test.samples.at(-1).video;test.mediaAdvance=test.final.time-start;
 test.success=test.mediaAdvance>=wall*.85&&test.errors.length===0&&(mode==='off'||test.final.quality.enhancement.frames>0);await page.screenshot({path:`${dir}/${sample.id}-${mode}.png`,fullPage:true});
 // A matched, paused frame for visual inspection. Native controls remain outside crop.
 if(mode!=='off'&&test.final.quality.enhancement.active){await page.evaluate(()=>document.querySelector('video').pause());const v=page.locator('.video-wrap');await v.screenshot({path:`${dir}/${sample.id}-same-on.png`});await page.selectOption('#enhancement','off');await v.screenshot({path:`${dir}/${sample.id}-same-off.png`});test.visual={on:`${sample.id}-same-on.png`,off:`${sample.id}-same-off.png`,time:test.final.time};}
 }catch(e){test.error=e.message;try{test.final=await page.evaluate(()=>({metrics:window.streamdesk.metrics,quality:window.streamdesk.player.qualityState()}));await page.screenshot({path:`${dir}/${sample.id}-${mode}-failure.png`,fullPage:true})}catch{}}
 await fs.writeFile(`${dir}/${sample.id}-${mode}.json`,JSON.stringify(test,null,2));await fs.writeFile(`${dir}/benchmark.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({sample:test.sample,mode,success:test.success,firstFrameMs:test.firstFrameMs,cpuOneCore:test.cpuOneCorePercent,enhancement:test.final?.quality.enhancement,error:test.error}));await context.close();
}
}finally{await browser.close()}
