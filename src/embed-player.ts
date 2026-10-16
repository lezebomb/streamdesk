import type {Episode} from '../shared/model';

export function embedStartUrl(url:string,position:number):string {
 const u=new URL(url);if(u.origin==='https://framextv.xyz'&&/^\/embed\/\d+(?:\/\d+\/\d+)?$/.test(u.pathname)&&Number.isFinite(position)&&position>0)u.searchParams.set('t',String(Math.floor(position)));return u.href;
}
export function frameXProgress(event:MessageEvent,frame:HTMLIFrameElement):{position:number;duration:number}|undefined {
 if(event.source!==frame.contentWindow||event.origin!=='https://framextv.xyz'||event.data?.event!=='frameXTV:timeupdate')return;
 const {currentTime,duration}=event.data;if(typeof currentTime!=='number'||typeof duration!=='number'||!Number.isFinite(currentTime)||!Number.isFinite(duration)||duration<=0||duration>86400||currentTime<0||currentTime>duration+1)return;
 return {position:Math.min(currentTime,duration),duration};
}
// Keep the provider's player. A loaded iframe is never reported as a decoded frame.
export class EmbedPlayer {
 position=0;hasProgress=false;private dispose:()=>void=()=>{};
 private status:(s:string)=>void;private progress:(position:number)=>void;
 constructor(status:(s:string)=>void,progress:(position:number)=>void){this.status=status;this.progress=progress}
 stop(){this.dispose();this.dispose=()=>{};document.querySelector('#embed')?.removeAttribute('src');this.hasProgress=false;this.position=0;this.screen(false)}
 private screen(playing:boolean){window.dispatchEvent(new CustomEvent('streamdesk-embed-state',{detail:{playing}}))}
 load(episode:Episode,position=0){
  this.stop();this.position=position;const previous=document.querySelector<HTMLIFrameElement>('#embed')!,frame=previous.cloneNode(false) as HTMLIFrameElement;previous.replaceWith(frame);frame.hidden=false;
  let timeout:ReturnType<typeof setTimeout>,sleep:ReturnType<typeof setTimeout>|undefined,last=position,resume=position>5,seekSent=false;
  const message=(event:MessageEvent)=>{const state=frameXProgress(event,frame);if(!state)return;
   // Some providers override the URL start time with their own saved position.
   // Use the documented SDK once after media metadata, and require acknowledgement
   // before replacing the user's saved progress with a conflicting initial value.
   if(resume){const target=Math.min(position,state.duration-1);if(Math.abs(state.position-target)>3){if(!seekSent){seekSent=true;frame.contentWindow?.postMessage({action:'seek',time:target},'https://framextv.xyz');this.status('正在恢复播放进度…')}return}resume=false}
   this.hasProgress=true;this.position=state.position;clearTimeout(timeout);this.progress(state.position);if(state.position!==last){this.status('FrameXTV · 进度已同步');this.screen(true);clearTimeout(sleep);sleep=setTimeout(()=>this.screen(false),10000)}last=state.position};
  window.addEventListener('message',message);frame.onerror=()=>{this.status('嵌入页面无法连接，请切换线路');this.screen(false)};
  timeout=setTimeout(()=>{if(!this.hasProgress)this.status('尚未收到播放进度，可在播放器内或下方切换线路');this.screen(false)},30000);
  this.dispose=()=>{clearTimeout(timeout);clearTimeout(sleep);window.removeEventListener('message',message);frame.onerror=null};
  this.status('正在连接嵌入线路…');this.screen(true);frame.src=embedStartUrl(episode.url,position);
 }
}
