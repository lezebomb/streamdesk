import Hls from 'hls.js';
import {VideoEnhancement} from './enhancement';
import {PlaybackRecovery} from './vendor/playback-recovery';
import type {Episode,Metrics} from '../shared/model';
import {playbackPolicy,type DeviceNetwork} from '../shared/playback-policy';
export const freshMetrics=():Metrics=>({firstFrameMs:null,stallMs:0,stalls:0,watchMs:0,seekMs:[],fragments:[],errors:[],switches:0,frames:0,droppedFrames:0});
export class Player {
 video:HTMLVideoElement;enhancement:VideoEnhancement;hls:Hls|null=null;metrics=freshMetrics();episode:Episode|null=null;private lastPosition=0;
 manualLevel=-1;policy=playbackPolicy();private fps:number|null=null;private fpsAnchor:{frames:number;mediaTime:number}|null=null;private generation=0;
 contentAnime=false;private needsUserPlay=false;
 private parsedVideoCodec:string|null=null;
 capabilities:{height:number;codec:string;supported:boolean;smooth:boolean;powerEfficient:boolean}[]=[];
 private recovery=new PlaybackRecovery({maxNetworkRetries:2,maxMediaRecoveries:1});
 private cleanups:(()=>void)[]=[];private started=0;private lastTick=0;private stallAt=0;private seekAt=0;private pendingSeek=false;private settled=false;private watchdog:ReturnType<typeof setInterval>|null=null;private frameId=0;private decoderRecovered=false;
 constructor(video:HTMLVideoElement,private status:(s:string)=>void,private fail:(reason:string)=>void,private update:(m:Metrics)=>void){this.video=video;this.enhancement=new VideoEnhancement(video)}
 stop(){
  this.enhancement.reset();this.settled=true;++this.generation;if(this.watchdog)clearInterval(this.watchdog);this.watchdog=null;
  this.recovery.dispose();for(const cleanup of this.cleanups)cleanup();this.cleanups=[];
  if(this.frameId)this.video.cancelVideoFrameCallback(this.frameId);
  this.hls?.destroy();this.hls=null;this.manualLevel=-1;this.capabilities=[];this.fps=null;this.fpsAnchor=null;this.parsedVideoCodec=null;this.video.pause();this.video.removeAttribute('src');this.video.load();
 }
 async load(episode:Episode,position=0,autoplay=true,switches=0,observedMbps?:number){
  this.stop();this.settled=false;this.episode=episode;this.metrics={...freshMetrics(),switches};this.lastPosition=position;this.started=performance.now();this.lastTick=this.started;this.stallAt=0;this.seekAt=0;this.pendingSeek=false;this.decoderRecovered=false;
  this.recovery=new PlaybackRecovery({maxNetworkRetries:2,maxMediaRecoveries:1});
  this.needsUserPlay=false;
  const device=navigator as Navigator&{deviceMemory?:number;connection?:DeviceNetwork&{downlink?:number;rtt?:number}};
  const network=device.connection;this.policy=playbackPolicy({memoryGB:device.deviceMemory,saveData:network?.saveData,effectiveType:network?.effectiveType,downlinkMbps:observedMbps??network?.downlink,rttMs:network?.rtt});
  const v=this.video;this.status('正在连接媒体…');
  const on=(event:string,handler:EventListener)=>{v.addEventListener(event,handler);this.cleanups.push(()=>v.removeEventListener(event,handler))};
  const terminal=(reason:string)=>{if(this.settled)return;this.closeStall();this.settled=true;this.hls?.stopLoad();v.pause();this.status(reason);this.fail(reason)};
  on('loadedmetadata',()=>{if(position>0&&Number.isFinite(v.duration))v.currentTime=Math.min(position,Math.max(0,v.duration-1));});
  on('waiting',()=>{if(this.metrics.firstFrameMs!==null&&!v.paused&&!v.seeking&&!this.pendingSeek&&!this.stallAt){this.stallAt=performance.now();this.metrics.stalls++;this.status('缓冲中…')}});
  on('playing',()=>{this.closeStall();this.status('播放中')});
  on('play',()=>{this.needsUserPlay=false});
  on('pause',()=>this.closeStall());
  on('seeking',()=>{this.closeStall();this.fpsAnchor=null;if(v.currentTime>0)this.lastPosition=v.currentTime;this.seekAt=performance.now();this.pendingSeek=true;this.status('正在定位…')});
  on('seeked',()=>{this.pendingSeek=false});
  on('error',()=>{const code=v.error?.code;this.metrics.errors.push({type:'native',details:`code=${code}`,at:performance.now()-this.started});terminal(`媒体错误 ${code??''}`)});
  on('ended',()=>this.status('本集播放完成'));
  const frame=(_time:number,meta:VideoFrameCallbackMetadata)=>{if(this.settled)return;const now=performance.now();if(this.metrics.firstFrameMs===null){this.metrics.firstFrameMs=now-this.started;this.status('播放中')}
   if(this.seekAt&&!v.seeking&&!this.pendingSeek){this.metrics.seekMs.push(now-this.seekAt);this.seekAt=0;this.status('播放中')}
   if(!this.fpsAnchor)this.fpsAnchor={frames:meta.presentedFrames,mediaTime:meta.mediaTime};
   else if(meta.mediaTime-this.fpsAnchor.mediaTime>=1){const elapsed=meta.mediaTime-this.fpsAnchor.mediaTime;this.fps=(meta.presentedFrames-this.fpsAnchor.frames)/elapsed;this.fpsAnchor={frames:meta.presentedFrames,mediaTime:meta.mediaTime}}
   this.metrics.frames++;this.enhancement.frame(now,meta,this.contentAnime,this.hls?.levels[this.hls.currentLevel]?.attrs['VIDEO-RANGE']==='PQ'||this.hls?.levels[this.hls.currentLevel]?.attrs['VIDEO-RANGE']==='HLG',this.started,this.fps||30);this.frameId=v.requestVideoFrameCallback(frame);
  };
  if('requestVideoFrameCallback'in v)this.frameId=v.requestVideoFrameCallback(frame);
  else on('loadeddata',()=>{if(this.metrics.firstFrameMs===null)this.metrics.firstFrameMs=performance.now()-this.started});
  const play=()=>{if(autoplay)v.play().catch(error=>{if(error.name==='NotAllowedError'){this.needsUserPlay=true;this.status('点击播放器开始播放')}});};
  if(episode.kind==='hls'&&Hls.isSupported()){
   const retry={maxNumRetry:1,retryDelayMs:800,maxRetryDelayMs:1600};
   this.hls=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:this.policy.targetBufferSeconds,maxMaxBufferLength:this.policy.maxBufferSeconds,backBufferLength:this.policy.backBufferSeconds,maxBufferSize:this.policy.maxBufferBytes,capLevelToPlayerSize:true,capLevelOnFPSDrop:true,startLevel:0,abrEwmaDefaultEstimate:this.policy.bandwidthEstimate,abrBandWidthFactor:.7,abrBandWidthUpFactor:.6,
    manifestLoadPolicy:{default:{maxTimeToFirstByteMs:8000,maxLoadTimeMs:10000,timeoutRetry:retry,errorRetry:retry}},
    fragLoadPolicy:{default:{maxTimeToFirstByteMs:8000,maxLoadTimeMs:15000,timeoutRetry:retry,errorRetry:retry}}});
   const hls=this.hls;
   hls.on(Hls.Events.MANIFEST_PARSED,()=>{this.status('媒体清单已就绪');void this.probeCapabilities();play()});
   hls.on(Hls.Events.BUFFER_CODECS,(_e,d)=>{this.parsedVideoCodec=d.tracks?.video?.codec||this.parsedVideoCodec});
   hls.on(Hls.Events.FRAG_LOADED,(_e,d)=>{this.recovery.markHealthy();const ms=d.frag.stats.loading.end-d.frag.stats.loading.start,bytes=d.frag.stats.total;
    if(ms>0&&bytes>0)this.metrics.fragments.push({url:d.frag.url,bytes,ms,mbps:bytes*8/ms/1000,mediaMbps:d.frag.duration>0?bytes*8/d.frag.duration/1e6:undefined,stream:d.frag.type,level:d.frag.level});if(this.metrics.fragments.length>80)this.metrics.fragments.shift();});
   hls.on(Hls.Events.ERROR,(_e,d)=>{this.metrics.errors.push({type:d.type,details:d.details,at:performance.now()-this.started,httpStatus:d.response?.code});if(this.metrics.errors.length>100)this.metrics.errors.shift();
    if([401,403,404,410].includes(d.response?.code||0)){terminal(`来源返回 HTTP ${d.response!.code}`);return}if(!d.fatal)return;
    // Hls already performed its bounded manifest retry. Repeating a broken/CORS-blocked
    // startup manifest in the recovery controller delays a usable alternate source.
    if(/^(?:manifestLoadError|manifestLoadTimeOut|manifestParsingError|manifestIncompatibleCodecsError|levelEmptyError)$/.test(d.details)){terminal('来源媒体清单不可用：'+d.details);return}
    // Hls already performed its bounded manifest retry. Repeating a broken/CORS-blocked
    // startup manifest in the recovery controller delays a usable alternate source.
    if(this.metrics.firstFrameMs===null&&/^(?:manifestLoadError|manifestLoadTimeOut|manifestParsingError|manifestIncompatibleCodecsError|levelEmptyError)$/.test(d.details)){terminal('来源媒体清单不可用：'+d.details);return}
    const decision=this.recovery.onFatal(d.type,d.details);this.status(decision.reason);
    if(decision.action==='retry')this.recovery.schedule(decision.delayMs,()=>hls.startLoad(v.currentTime||position));
    else if(decision.action==='recover-media'){if(decision.swapAudio)hls.swapAudioCodec();hls.recoverMediaError()}
    else if(decision.action==='switch-source')terminal(decision.reason);
   });
   hls.attachMedia(v);hls.loadSource(episode.url);
  }else if(episode.kind==='mp4'||(episode.kind==='hls'&&v.canPlayType('application/vnd.apple.mpegurl'))){v.src=episode.url;v.load();play()}
  else {terminal('当前浏览器不支持该媒体格式');return}
  this.watchdog=setInterval(()=>{
   const now=performance.now(),delta=now-this.lastTick;this.lastTick=now;
   if(!this.settled&&v.readyState>=2&&Number.isFinite(v.currentTime))this.lastPosition=v.currentTime;
   if(this.metrics.firstFrameMs!==null&&!v.paused&&!v.ended&&!v.seeking&&!this.seekAt&&!document.hidden)this.metrics.watchMs+=delta;
   const quality=v.getVideoPlaybackQuality?.();if(quality)this.metrics.droppedFrames=quality.droppedVideoFrames;
   this.update(this.snapshot());
   if(this.settled||document.hidden||v.ended||(this.needsUserPlay&&v.paused))return;
   if(this.metrics.firstFrameMs===null&&now-this.started>this.policy.startupDeadlineMs){terminal('首帧加载超时');return}
   if(v.paused)return;
   if(this.seekAt&&now-this.seekAt>this.policy.seekDeadlineMs){terminal('快进定位超时');return}
   if(this.stallAt&&now-this.stallAt>this.policy.stallDeadlineMs){
    const buffer=this.bufferSeconds();
    if(buffer>5&&this.hls&&!this.decoderRecovered){this.decoderRecovered=true;this.metrics.stallMs+=now-this.stallAt;this.hls.recoverMediaError();this.stallAt=now;this.status('缓冲充足，尝试恢复解码');}
    else terminal(buffer>5?'疑似解码器停滞':'持续缓冲超时');
   }
  },500);
 }
 private closeStall(){if(this.stallAt){this.metrics.stallMs+=performance.now()-this.stallAt;this.stallAt=0}}
 snapshot():Metrics{return {...this.metrics,stallMs:this.metrics.stallMs+(this.stallAt?performance.now()-this.stallAt:0),seekMs:[...this.metrics.seekMs],fragments:[...this.metrics.fragments],errors:[...this.metrics.errors]}}
 bufferSeconds(){const v=this.video;for(let i=0;i<v.buffered.length;i++)if(v.buffered.start(i)<=v.currentTime&&v.buffered.end(i)>v.currentTime)return v.buffered.end(i)-v.currentTime;return 0}
 qualityLevels(){return this.hls?.levels.map((l,i)=>{const single=this.hls!.levels.length===1,height=l.height||(single?this.video.videoHeight:0),width=l.width||(single?this.video.videoWidth:0),codec=l.videoCodec||(single?this.parsedVideoCodec:null);return {i,width,height,bitrate:l.bitrate||null,codec,frameRate:l.attrs['FRAME-RATE']?Number(l.attrs['FRAME-RATE']):null,label:`${height||'?'}p${height>=2160?' / 4K':''} · ${l.bitrate?(l.bitrate/1e6).toFixed(1)+' Mbps':'清单未标注码率'}${codec?' · '+codec:''}`}})||[]}
 setQuality(level:number){if(!this.hls||!Number.isInteger(level)||level< -1||level>=this.hls.levels.length)return;this.manualLevel=level;this.hls.capLevelToPlayerSize=level===-1;this.hls.nextLevel=level}
 qualityState(){const l=this.hls?.levels[this.hls.currentLevel];return {width:this.video.videoWidth,height:this.video.videoHeight,presentedFps:this.fps,declaredFps:l?.attrs['FRAME-RATE']?Number(l.attrs['FRAME-RATE']):null,codec:l?.videoCodec||this.parsedVideoCodec||null,sourceBufferCodec:this.parsedVideoCodec,manifestBitrate:l?.bitrate||null,segmentMediaMbps:this.metrics.fragments.slice().reverse().find(f=>f.stream==='main'&&f.level===this.hls?.currentLevel)?.mediaMbps??null,bandwidthEstimate:this.hls?.bandwidthEstimate??null,currentLevel:this.hls?.currentLevel??null,manualLevel:this.manualLevel,policy:this.policy,capabilities:this.capabilities,enhancement:this.enhancement.snapshot(),hardwareDecoder:'Web API 无法确定实际硬件解码器'} }
 private async probeCapabilities(){const generation=this.generation;this.capabilities=[];if(!navigator.mediaCapabilities)return;for(const l of this.hls?.levels||[]){if(!l.videoCodec||!l.width||!l.height)continue;try{const info=await navigator.mediaCapabilities.decodingInfo({type:'media-source',video:{contentType:`video/mp4; codecs="${l.videoCodec}"`,width:l.width,height:l.height,bitrate:l.bitrate,framerate:Number(l.attrs['FRAME-RATE'])||30}});if(generation!==this.generation)return;this.capabilities.push({height:l.height,codec:l.videoCodec,supported:info.supported,smooth:info.smooth,powerEfficient:info.powerEfficient})}catch{/* Unknown capability is never advertised as hardware support. */}}}
 resumePosition(){return this.video.readyState>=2&&Number.isFinite(this.video.currentTime)?this.video.currentTime:this.lastPosition}
}
