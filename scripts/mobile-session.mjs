import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),port=Number(process.env.MOBILE_PORT||4190),nonce=randomUUID(),dir=process.env.RUN_DIR||'reports/runs/mobile-mate60-visible';await fs.mkdir(dir,{recursive:true});
const state={at:new Date().toISOString(),device:'Huawei Mate 60 / BRA-AL00',build:'4.2.0.220',events:[],hardware:[],complete:false};
const script=String.raw`
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,ms=30000)=>{const at=performance.now();while(!fn()){if(performance.now()-at>ms)throw Error('Timeout');await sleep(200)}};
let wake=null;const send=async event=>fetch('/capture/TOKEN',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({at:new Date().toISOString(),...event})}).catch(()=>{});
const panel=document.createElement('div');panel.style='position:fixed;top:0;left:0;right:0;padding:14px;z-index:999;background:#c6eb91;color:#111;font:16px sans-serif;text-align:center';panel.innerHTML='<strong>StreamDesk 手机实测</strong> <button id="mobile-start" style="padding:15px;margin:8px">开始测试</button><span id="mobile-phase">只操作本页，不改系统设置</span>';document.body.append(panel);
await send({kind:'ready',userAgent:navigator.userAgent,screen:{width:innerWidth,height:innerHeight,ratio:devicePixelRatio},webgl2:!!document.createElement('canvas').getContext('webgl2'),webgpu:'gpu'in navigator,wakeLock:'wakeLock'in navigator});
document.querySelector('#mobile-start').onclick=async()=>{
 document.querySelector('#mobile-start').disabled=true;const text=document.querySelector('#mobile-phase');
 try{wake=await navigator.wakeLock?.request('screen')}catch{}await send({kind:'wake-lock',held:!!wake});
 try{await wait(()=>window.streamdesk?.sources.length);const p=window.streamdesk.player;const sources=window.streamdesk.sources;
 const samples=[{name:'480p-animation',source:'open-backup',id:'bbb',modes:['off','lite']},{name:'1080p-anime',source:'hongniu',query:'葬送的芙莉莲',year:'2023',modes:['off','anime']},{name:'live-action',source:'hongniu',query:'爱情公寓3',year:'2012',modes:['off','balanced']}];
 for(const sample of samples){let film;if(sample.id)film=(await fetch('/api/detail?source='+sample.source+'&id='+sample.id).then(r=>r.json())).film;else {const rows=(await fetch('/api/search?q='+encodeURIComponent(sample.query)).then(r=>r.json())).rows;film=rows.find(r=>r.sourceId===sample.source)?.list.find(f=>f.title===sample.query&&f.year===sample.year);}
 if(!film){await send({kind:'case',name:sample.name,ok:false,error:'No exact film'});continue}
 for(const mode of sample.modes){text.textContent=sample.name+' / '+mode;p.enhancement.setMode(mode);document.querySelector('#enhancement').value=mode;p.video.muted=true;await window.streamdesk.open(film);panel.style.top='auto';panel.style.bottom='0';panel.style.fontSize='12px';panel.style.padding='5px';document.querySelector('.video-wrap').scrollIntoView({behavior:'instant',block:'center'});await p.video.play();await send({kind:'pre-frame',name:sample.name,mode,native:{paused:p.video.paused,ready:p.video.readyState,time:p.video.currentTime,width:p.video.videoWidth,height:p.video.videoHeight},metrics:p.snapshot()});await wait(()=>p.metrics.firstFrameMs!==null);const start=p.video.currentTime,started=performance.now();
 await send({kind:'start',name:sample.name,mode,firstFrameMs:p.metrics.firstFrameMs,quality:p.qualityState()});
 for(let i=0;i<6;i++){await sleep(5000);const q=p.video.getVideoPlaybackQuality();await send({kind:'sample',name:sample.name,mode,elapsedMs:performance.now()-started,time:p.video.currentTime,paused:p.video.paused,metrics:{...p.snapshot(),fragments:p.metrics.fragments.slice(-2)},quality:p.qualityState(),frames:{total:q.totalVideoFrames,dropped:q.droppedVideoFrames},jsHeapBytes:performance.memory?.usedJSHeapSize??null});}
 const previous=p.metrics.seekMs.length,target=Math.min(p.video.duration-10,Math.max(90,...Array.from({length:p.video.buffered.length},(_,i)=>p.video.buffered.end(i)+30)));p.video.currentTime=target;await wait(()=>p.metrics.seekMs.length>previous,21000);await sleep(3000);
 await send({kind:'case',name:sample.name,mode,ok:p.video.currentTime>target+1,mediaAdvanceSeconds:p.video.currentTime-target,watchAdvanceBeforeSeek:start,seekMs:p.metrics.seekMs.at(-1),metrics:{...p.snapshot(),fragments:p.metrics.fragments.slice(-2)},quality:p.qualityState()});
 p.enhancement.setMode('off');if(document.querySelectorAll('.enhancement-canvas').length)throw Error('Enhanced canvas not released');
 }
 }
 await send({kind:'complete',ok:true});text.textContent='实测完成；视频已停止';
 }catch(e){await send({kind:'failure',error:String(e),state:window.streamdesk?.player.qualityState(),native:{paused:window.streamdesk?.player.video.paused,ready:window.streamdesk?.player.video.readyState,time:window.streamdesk?.player.video.currentTime,width:window.streamdesk?.player.video.videoWidth},metrics:window.streamdesk?.metrics});text.textContent='已记录失败；原画播放不受修改';}
 finally{window.streamdesk?.player.stop();await wake?.release().catch(()=>{});wake=null;}
};
`.replaceAll('TOKEN',nonce);
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost:'+port);
 if(req.method==='POST'&&u.pathname==='/capture/'+nonce){let b='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>128*1024)throw Error('Too large');b+=chunk}const event=JSON.parse(b);state.events.push(event);if(event.kind==='complete')state.complete=true;await fs.writeFile(dir+'/session.json',JSON.stringify(state,null,2));res.end('ok');console.log(JSON.stringify({kind:event.kind,name:event.name,mode:event.mode,ok:event.ok,error:event.error}));return;}
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(u.pathname.startsWith('/api/')){const r=await fetch('http://127.0.0.1:4187'+u.pathname+u.search,{signal:AbortSignal.timeout(25000)});res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')});res.end(Buffer.from(await r.arrayBuffer()));return;}
 if(u.pathname==='/mobile-harness.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(script);return;}
 const root=path.resolve('dist'),file=u.pathname==='/'?path.join(root,'index.html'):path.resolve(root,'.'+u.pathname);if(file!==path.join(root,'index.html')&&!file.startsWith(root+path.sep))throw Error('Bad path');let b=await fs.readFile(file);if(u.pathname==='/')b=Buffer.from(b.toString().replace('</body>','<script type="module" src="/mobile-harness.js"></script></body>'));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);
 }catch(e){res.writeHead(500);res.end(e.message)}});server.listen(port,'127.0.0.1',()=>console.log('MOBILE '+port));
// Read-only telemetry. Battery temperature is not CPU/GPU junction temperature.
const monitor=setInterval(async()=>{try{const battery=(await exec('adb',['shell','dumpsys','battery'],{windowsHide:true,timeout:5000})).stdout;const memory=(await exec('adb',['shell','dumpsys','meminfo','com.huawei.browser'],{windowsHide:true,timeout:5000,maxBuffer:65536})).stdout;state.hardware.push({at:new Date().toISOString(),battery,appTotalPssKB:Number(memory.match(/TOTAL\s+(\d+)/)?.[1])||null});await fs.writeFile(dir+'/session.json',JSON.stringify(state,null,2));}catch(e){state.hardware.push({at:new Date().toISOString(),error:e.message})}},10000);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(monitor);server.close(()=>process.exit())});
