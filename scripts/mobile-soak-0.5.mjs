import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {mobileCDP} from './mobile-cdp.mjs';
const appURL=process.env.MOBILE_APP_URL||'http://localhost:4191/',dir=process.env.RUN_DIR||`reports/runs/mobile-0.5-soak-${Date.now()}`;
const minutes=Number(process.env.SOAK_MINUTES||10);if(!Number.isFinite(minutes)||minutes<1||minutes>30)throw Error('SOAK_MINUTES must be 1..30');
await fs.mkdir(dir,{recursive:true});const c=await mobileCDP({appURL}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const initialAuto=await c.evaluate('document.querySelector("#auto-switch").checked');
const out={at:new Date().toISOString(),version:'0.5.0',device:'Huawei Mate 60',client:'Huawei Browser (not APK)',source:'ruyi',canonicalId:'douban:37037752',requestedMinutes:minutes,enhancement:'off',autoSwitch:false,telemetryScope:'Main Huawei browser process only, including its other tabs; thermalservice temperatures may be cached. USB charging: not a battery power benchmark. No GPU utilization counter.',samples:[],success:false};
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',windowsHide:true,timeout:6000,maxBuffer:8388608});
async function wait(expression,ms=45000){const at=Date.now();while(!await c.evaluate(expression)){if(Date.now()-at>ms)throw Error('Timeout: '+expression);await sleep(250)}}
async function capture(name){if(!await c.evaluate(`document.visibilityState==='visible'&&location.origin===${JSON.stringify(new URL(appURL).origin)}&&!document.querySelector('#account-dialog').open`))throw Error('Owned page not visible');if(!/mCurrentFocus=.*com\.huawei\.browser/.test(adb('shell','dumpsys','window')))throw Error('Browser not foreground');await fs.writeFile(dir+'/'+name+'.png',execFileSync('adb',['exec-out','screencap','-p'],{windowsHide:true,timeout:6000,maxBuffer:16777216}))}
function telemetry(){
 const battery=adb('shell','dumpsys','battery');const mem=adb('shell','dumpsys','meminfo','com.huawei.browser');const thermal=adb('shell','dumpsys','thermalservice');
 const pid=adb('shell','pidof','com.huawei.browser').trim().split(/\s+/)[0];const top=adb('shell','top','-b','-n','1','-p',pid);const row=top.trim().split(/\r?\n/).find(x=>new RegExp('^\\s*'+pid+'\\s').test(x));
 return {batteryLevel:Number(battery.match(/level:\s*(\d+)/)?.[1]),batteryCelsius:Number(battery.match(/temperature:\s*(\d+)/)?.[1])/10,usbCharging:/USB powered: true/.test(battery),browserMainCpuPercent:row?Number(row.trim().split(/\s+/)[8]):null,mainPssKiB:Number(mem.match(/TOTAL PSS:\s*(\d+)/)?.[1]),thermalStatus:Number(thermal.match(/Thermal Status:\s*(\d+)/)?.[1]),reportedTemperatures:[...thermal.matchAll(/Temperature\{mValue=([\d.-]+), mType=\d+, mName=([^,]+), mStatus=(\d+)\}/g)].map(m=>({celsius:Number(m[1]),name:m[2],status:Number(m[3])}))};
}
async function persist(){await fs.writeFile(dir+'/result.json',JSON.stringify(out,null,2))}
try{
 await c.call('Page.enable');await wait('!!window.streamdesk?.sources.length');out.baseline=telemetry();
 await c.evaluate(`(async()=>{if(!window.testWake||window.testWake.released)window.testWake=await navigator.wakeLock.request('screen');document.querySelector('#auto-switch').checked=false;document.querySelector('#auto-switch').dispatchEvent(new Event('change'));window.streamdesk.player.enhancement.setMode('off');const d=await fetch('/api/search?q='+encodeURIComponent('我们不可能成为恋人')).then(r=>r.json());const f=d.rows.find(r=>r.sourceId==='ruyi')?.list.find(f=>f.canonicalId==='douban:37037752');if(!f)throw Error('Exact anime missing');window.streamdesk.player.video.muted=true;void window.streamdesk.open(f);return true})()`);
 await wait('window.streamdesk.current?.sourceId==="ruyi"&&window.streamdesk.metrics.firstFrameMs!==null');
 await c.evaluate('document.querySelector("video").playbackRate=1;document.querySelector(".video-wrap").scrollIntoView({block:"center",behavior:"instant"});true');await sleep(600);await capture('first-frame');
 out.initial=await c.evaluate('({time:document.querySelector("video").currentTime,quality:window.streamdesk.player.qualityState(),metrics:window.streamdesk.metrics})');const started=performance.now();let n=0;
 while(performance.now()-started<minutes*60000){
  await sleep(10000);const sample=await c.evaluate(`({source:window.streamdesk.current?.sourceId,time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused,ended:document.querySelector('video').ended,hidden:document.hidden,wake:!!window.testWake&&!window.testWake.released,bufferSeconds:window.streamdesk.player.bufferSeconds(),status:document.querySelector('#play-status').textContent,metrics:{...window.streamdesk.metrics,fragments:window.streamdesk.metrics.fragments.slice(-2)},quality:window.streamdesk.player.qualityState()})`);sample.elapsedMs=performance.now()-started;
  if(n++%6===0)sample.telemetry=telemetry();out.samples.push(sample);await persist();
  if(sample.telemetry?.batteryCelsius>=40||sample.telemetry?.thermalStatus>=3)throw Error('Conservative thermal stop');
  if(sample.source!=='ruyi'||sample.hidden||sample.paused||!sample.wake)throw Error('Playback or page visibility interrupted: '+sample.status);
  if(sample.ended){out.ended=true;break}if(n%6===0)console.log(JSON.stringify({minutes:sample.elapsedMs/60000,time:sample.time,stalls:sample.metrics.stalls,stallMs:sample.metrics.stallMs,bufferSeconds:sample.bufferSeconds}));
 }
 const last=out.samples.at(-1);out.final=last;out.observedMs=last.elapsedMs;out.mediaAdvanceSeconds=last.time-out.initial.time;out.endTelemetry=telemetry();out.success=out.mediaAdvanceSeconds>=out.observedMs/1000*.9&&(out.observedMs>=minutes*60000||out.ended);await capture('final');
}catch(e){out.error=e.message;out.fault=/thermal/i.test(e.message)?'thermal_safety_stop':/HTTP|manifest/.test(e.message)?'source_or_network':'playback_or_visibility_unresolved';try{await capture('failure')}catch{}}
finally{try{await c.evaluate(`if(!document.querySelector('#watch').hidden)document.querySelector('#close-watch').click();window.streamdesk.player.stop();window.testWake?.release();document.querySelector('#auto-switch').checked=${initialAuto};document.querySelector('#auto-switch').dispatchEvent(new Event('change'));true`)}catch{}out.finishedAt=new Date().toISOString();await persist();c.close();console.log(JSON.stringify({success:out.success,dir,observedMs:out.observedMs,advance:out.mediaAdvanceSeconds,error:out.error}));if(!out.success)process.exitCode=1}
