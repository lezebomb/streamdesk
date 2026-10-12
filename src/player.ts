import Hls from 'hls.js';
import {PlaybackRecovery} from './vendor/playback-recovery';
import type {Episode,Metrics} from '../shared/model';
export const freshMetrics=():Metrics=>({firstFrameMs:null,stallMs:0,stalls:0,watchMs:0,seekMs:[],fragments:[],errors:[],switches:0,frames:0,droppedFrames:0});
export class Player {
 video:HTMLVideoElement;hls:Hls|null=null;metrics=freshMetrics();episode:Episode|null=null;private lastPosition=0;
 private recovery=new PlaybackRecovery({maxNetworkRetries:2,maxMediaRecoveries:1});
 private cleanups:(()=>void)[]=[];private started=0;private lastTick=0;private stallAt=0;private seekAt=0;private pendingSeek=false;private settled=false;private watchdog:ReturnType<typeof setInterval>|null=null;private frameId=0;private decoderRecovered=false;
 constructor(video:HTMLVideoElement,private status:(s:string)=>void,private fail:(reason:string)=>void,private update:(m:Metrics)=>void){this.video=video}
 stop(){
  this.settled=true;if(this.watchdog)clearInterval(this.watchdog);this.watchdog=null;
  this.recovery.dispose();for(const cleanup of this.cleanups)cleanup();this.cleanups=[];
  if(this.frameId)this.video.cancelVideoFrameCallback(this.frameId);
  this.hls?.destroy();this.hls=null;this.video.pause();this.video.removeAttribute('src');this.video.load();
 }
 async load(episode:Episode,position=0,autoplay=true,switches=0){
  this.stop();this.settled=false;this.episode=episode;this.metrics={...freshMetrics(),switches};this.lastPosition=position;this.started=performance.now();this.lastTick=this.started;this.stallAt=0;this.seekAt=0;this.pendingSeek=false;this.decoderRecovered=false;
  this.recovery=new PlaybackRecovery({maxNetworkRetries:2,maxMediaRecoveries:1});
  const v=this.video;this.status('正在连接媒体…');
  const on=(event:string,handler:EventListener)=>{v.addEventListener(event,handler);this.cleanups.push(()=>v.removeEventListener(event,handler))};
  const terminal=(reason:string)=>{if(this.settled)return;this.closeStall();this.settled=true;this.hls?.stopLoad();v.pause();this.status(reason);this.fail(reason)};
  on('loadedmetadata',()=>{if(position>0&&Number.isFinite(v.duration))v.currentTime=Math.min(position,Math.max(0,v.duration-1));});
  on('waiting',()=>{if(this.metrics.firstFrameMs!==null&&!v.paused&&!v.seeking&&!this.pendingSeek&&!this.stallAt){this.stallAt=performance.now();this.metrics.stalls++;this.status('缓冲中…')}});
  on('playing',()=>{this.closeStall();this.status('播放中')});
  on('pause',()=>this.closeStall());
  on('seeking',()=>{this.closeStall();if(v.currentTime>0)this.lastPosition=v.currentTime;this.seekAt=performance.now();this.pendingSeek=true;this.status('正在定位…')});
  on('seeked',()=>{this.pendingSeek=false});
  on('error',()=>{const code=v.error?.code;this.metrics.errors.push({type:'native',details:`code=${code}`,at:performance.now()-this.started});terminal(`媒体错误 ${code??''}`)});
  on('ended',()=>this.status('本集播放完成'));
  const frame=()=>{if(this.settled)return;const now=performance.now();if(this.metrics.firstFrameMs===null){this.metrics.firstFrameMs=now-this.started;this.status('播放中')}
   if(this.seekAt&&!v.seeking&&!this.pendingSeek){this.metrics.seekMs.push(now-this.seekAt);this.seekAt=0;this.status('播放中')}
   this.metrics.frames++;this.frameId=v.requestVideoFrameCallback(frame);
  };
  if('requestVideoFrameCallback'in v)this.frameId=v.requestVideoFrameCallback(frame);
  else on('loadeddata',()=>{if(this.metrics.firstFrameMs===null)this.metrics.firstFrameMs=performance.now()-this.started});
  const play=()=>{if(autoplay)v.play().catch(()=>this.status('点击播放器开始播放'));};
  if(episode.kind==='hls'&&Hls.isSupported()){
   const retry={maxNumRetry:1,retryDelayMs:800,maxRetryDelayMs:1600};
   this.hls=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:30,maxMaxBufferLength:60,backBufferLength:20,maxBufferSize:30*1000*1000,capLevelToPlayerSize:true,capLevelOnFPSDrop:true,startLevel:0,abrBandWidthFactor:.7,abrBandWidthUpFactor:.6,
    manifestLoadPolicy:{default:{maxTimeToFirstByteMs:8000,maxLoadTimeMs:10000,timeoutRetry:retry,errorRetry:retry}},
    fragLoadPolicy:{default:{maxTimeToFirstByteMs:8000,maxLoadTimeMs:15000,timeoutRetry:retry,errorRetry:retry}}});
   const hls=this.hls;
   hls.on(Hls.Events.MANIFEST_PARSED,()=>{this.status('媒体清单已就绪');play()});
   hls.on(Hls.Events.FRAG_LOADED,(_e,d)=>{this.recovery.markHealthy();const ms=d.frag.stats.loading.end-d.frag.stats.loading.start,bytes=d.frag.stats.total;
    if(ms>0&&bytes>0)this.metrics.fragments.push({url:d.frag.url,bytes,ms,mbps:bytes*8/ms/1000});if(this.metrics.fragments.length>80)this.metrics.fragments.shift();});
   hls.on(Hls.Events.ERROR,(_e,d)=>{this.metrics.errors.push({type:d.type,details:d.details,at:performance.now()-this.started});if(this.metrics.errors.length>100)this.metrics.errors.shift();
    if([401,403,404,410].includes(d.response?.code||0)){terminal(`来源返回 HTTP ${d.response!.code}`);return}if(!d.fatal)return;
    const decision=this.recovery.onFatal(d.type,d.details);this.status(decision.reason);
    if(decision.action==='retry')this.recovery.schedule(decision.delayMs,()=>hls.startLoad(v.currentTime||position));
    else if(decision.action==='recover-media'){if(decision.swapAudio)hls.swapAudioCodec();hls.recoverMediaError()}
    else if(decision.action==='switch-source')terminal(decision.reason);
   });
   hls.attachMedia(v);hls.loadSource(episode.url);
  }else if(episode.kind==='mp4'||(episode.kind==='hls'&&v.canPlayType('application/vnd.apple.mpegurl'))){v.src=episode.url;v.load();play()}
  else terminal('当前浏览器不支持该媒体格式');
  this.watchdog=setInterval(()=>{
   const now=performance.now(),delta=now-this.lastTick;this.lastTick=now;
   if(!this.settled&&v.readyState>=2&&Number.isFinite(v.currentTime))this.lastPosition=v.currentTime;
   if(this.metrics.firstFrameMs!==null&&!v.paused&&!v.ended&&!v.seeking&&!this.seekAt&&!document.hidden)this.metrics.watchMs+=delta;
   const quality=v.getVideoPlaybackQuality?.();if(quality)this.metrics.droppedFrames=quality.droppedVideoFrames;
   this.update(this.snapshot());
   if(document.hidden||v.paused||v.ended)return;
   if(this.metrics.firstFrameMs===null&&now-this.started>18000){terminal('18 秒内没有出画');return}
   if(this.seekAt&&now-this.seekAt>15000){terminal('快进定位超时');return}
   if(this.stallAt&&now-this.stallAt>8000){
    const buffer=this.bufferSeconds();
    if(buffer>5&&this.hls&&!this.decoderRecovered){this.decoderRecovered=true;this.metrics.stallMs+=now-this.stallAt;this.hls.recoverMediaError();this.stallAt=now;this.status('缓冲充足，尝试恢复解码');}
    else terminal(buffer>5?'疑似解码器停滞':'持续缓冲超过 8 秒');
   }
  },500);
 }
 private closeStall(){if(this.stallAt){this.metrics.stallMs+=performance.now()-this.stallAt;this.stallAt=0}}
 snapshot():Metrics{return {...this.metrics,stallMs:this.metrics.stallMs+(this.stallAt?performance.now()-this.stallAt:0),seekMs:[...this.metrics.seekMs],fragments:[...this.metrics.fragments],errors:[...this.metrics.errors]}}
 bufferSeconds(){const v=this.video;for(let i=0;i<v.buffered.length;i++)if(v.buffered.start(i)<=v.currentTime&&v.buffered.end(i)>v.currentTime)return v.buffered.end(i)-v.currentTime;return 0}
 qualityLevels(){return this.hls?.levels.map((l,i)=>({i,label:`${l.height||'?'}p · ${(l.bitrate/1e6).toFixed(1)} Mbps`}))||[]}
 setQuality(level:number){if(this.hls)this.hls.currentLevel=level}
 resumePosition(){return this.video.readyState>=2&&Number.isFinite(this.video.currentTime)?this.video.currentTime:this.lastPosition}
}
