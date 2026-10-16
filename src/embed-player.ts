import type {Episode} from '../shared/model';
export function embedStartUrl(url:string,position:number):string {const u=new URL(url);if(u.origin==='https://framextv.xyz'&&/^\/embed\/\d+(?:\/\d+\/\d+)?$/.test(u.pathname)&&Number.isFinite(position)&&position>0)u.searchParams.set('t',String(Math.floor(position)));return u.href}
export function frameXProgress(event:MessageEvent,frame:HTMLIFrameElement):{position:number;duration:number}|undefined {
 if(event.source!==frame.contentWindow||event.origin!=='https://framextv.xyz'||event.data?.event!=='frameXTV:timeupdate')return;
 const {currentTime,duration}=event.data;if(typeof currentTime!=='number'||typeof duration!=='number'||!Number.isFinite(currentTime)||!Number.isFinite(duration)||duration<=0||duration>86400||currentTime<0||currentTime>duration+1)return;
 return {position:Math.min(currentTime,duration),duration};
}
// Host gestures use the public SDK, without internal media access or HLS metrics.
export class EmbedPlayer extends EventTarget {
 position=0;duration=0;hasProgress=false;active=false;controlled=false;paused=false;rate=1;busy=false;error='';goal:number|null=null;
 private dispose:()=>void=()=>{};private frame:HTMLIFrameElement|null=null;private resumeAfterSeek=false;private seekAt=0;private lastMove=0;private resumeTarget:number|null=null;
 private status:(s:string)=>void;private progress:(position:number)=>void;
 constructor(status:(s:string)=>void,progress:(position:number)=>void){super();this.status=status;this.progress=progress}
 private emit(){this.dispatchEvent(new Event('change'));this.dispatchEvent(new Event('timeupdate'))}
 private screen(playing:boolean){window.dispatchEvent(new CustomEvent('streamdesk-embed-state',{detail:{playing}}))}
 private command(action:string,data:Record<string,unknown>={}){if(this.active&&this.frame&&new URL(this.frame.src).origin==='https://framextv.xyz')this.frame.contentWindow?.postMessage({action,...data},'https://framextv.xyz')}
 get currentTime(){return this.goal??this.position}
 set currentTime(value:number){this.seek(value)}
 play(){this.paused=false;this.resumeAfterSeek=true;if(this.goal!==null&&this.error){const retry=this.goal;this.goal=null;this.seek(retry,true)}else if(this.goal===null)this.command('play');this.lastMove=performance.now();this.status('正在播放…');this.emit();return Promise.resolve()}
 pause(){this.paused=true;this.resumeAfterSeek=false;this.command('pause');if(this.goal===null)this.busy=false;this.status('已暂停');this.screen(false);this.emit()}
 setRate(rate:number){if(![.5,.75,1,1.25,1.5,2].includes(rate))return;this.rate=rate;this.command('setSpeed',{speed:rate});this.emit()}
 seek(value:number,resume=!this.paused){if(!this.active||!Number.isFinite(value)||!this.duration)return;const next=Math.max(0,Math.min(this.duration-.1,value));if(this.goal!==null&&!this.error&&Math.abs(this.goal-next)<.5)return;this.resumeTarget=null;this.resumeAfterSeek=resume;this.command('pause');this.goal=next;this.busy=true;this.error='';this.seekAt=performance.now();this.command('seek',{time:next});this.status('正在定位…');this.emit()}
 stop(){this.dispose();this.dispose=()=>{};document.querySelector('#embed')?.removeAttribute('src');this.frame=null;this.active=false;this.controlled=false;this.hasProgress=false;this.position=0;this.duration=0;this.goal=null;this.busy=false;this.error='';this.rate=1;this.screen(false);this.dispatchEvent(new Event('emptied'));this.emit()}
 load(episode:Episode,position=0){
  this.stop();this.position=position;this.resumeTarget=position>5?position:null;this.active=true;this.paused=false;this.busy=true;this.controlled=new URL(episode.url).origin==='https://framextv.xyz'&&(window.streamdeskClient?.platform==='android'||typeof matchMedia==='function'&&matchMedia('(hover:none) and (pointer:coarse)').matches);
  const previous=document.querySelector<HTMLIFrameElement>('#embed')!,frame=previous.cloneNode(false) as HTMLIFrameElement;previous.replaceWith(frame);frame.hidden=false;this.frame=frame;
  let sleep:ReturnType<typeof setTimeout>|undefined,last=position,seekSent=false;const started=performance.now();this.lastMove=started;
  const message=(event:MessageEvent)=>{const state=frameXProgress(event,frame);if(!state)return;this.duration=state.duration;
   if(this.resumeTarget!==null){const target=Math.min(this.resumeTarget,state.duration-1);if(Math.abs(state.position-target)>3){if(!seekSent){seekSent=true;this.command('seek',{time:target});this.status('正在恢复播放进度…')}this.emit();return}this.resumeTarget=null}
   if(this.goal!==null){if(Math.abs(state.position-this.goal)>1){this.emit();return}this.goal=null;this.busy=false;this.paused=!this.resumeAfterSeek;if(this.resumeAfterSeek)this.command('play');this.dispatchEvent(new Event('seeked'))}
   this.hasProgress=true;this.position=state.position;this.progress(state.position);if(state.position!==last){this.lastMove=performance.now();this.busy=false;this.error='';this.status(this.paused?'已暂停':'FrameXTV · 进度已同步');this.screen(!this.paused);clearTimeout(sleep);sleep=setTimeout(()=>this.screen(false),10000)}last=state.position;this.emit();
  };
  window.addEventListener('message',message);frame.onerror=()=>{this.error='线路无法连接，请切换线路';this.busy=false;this.status(this.error);this.screen(false);this.emit()};
  const watchdog=setInterval(()=>{const now=performance.now();if(this.goal!==null&&now-this.seekAt>20000){this.error='定位超时，请切换线路重试';this.busy=false;this.status(this.error);this.screen(false)}else if(!this.hasProgress&&!this.paused&&now-started>30000){this.error='线路加载超时，请切换线路';this.busy=false;this.status(this.error);this.screen(false)}else if(this.hasProgress&&!this.paused&&this.goal===null){if(now-this.lastMove>20000){this.error='线路持续缓冲，请切换线路';this.busy=false;this.status(this.error);this.screen(false)}else if(now-this.lastMove>6000)this.busy=true}this.emit()},1000);
  this.dispose=()=>{clearInterval(watchdog);clearTimeout(sleep);window.removeEventListener('message',message);frame.onerror=null};
  const url=new URL(embedStartUrl(episode.url,position));if(this.controlled)url.searchParams.set('controls','0');frame.src=url.href;this.status('正在连接嵌入线路…');this.screen(true);this.emit();
 }
}
