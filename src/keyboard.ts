export function bindVideoKeyboard(video:HTMLVideoElement,active:()=>boolean,onHold:(holding:boolean)=>void=()=>{}){
 let pressed=false,holding=false,original=1,timer:ReturnType<typeof setTimeout>|undefined;
 const restore=()=>{clearTimeout(timer);if(holding){video.playbackRate=original;onHold(false)}pressed=false;holding=false};
 const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"],button,a,summary');
 const down=(e:KeyboardEvent)=>{
  if(!active()||e.altKey||e.ctrlKey||e.metaKey||editable(e.target))return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(video.paused)void video.play().catch(()=>{});else video.pause()}return}
  if(e.code!=='ArrowRight')return;e.preventDefault();if(pressed||e.repeat)return;pressed=true;original=video.playbackRate;
  timer=setTimeout(()=>{if(pressed&&active()){holding=true;video.playbackRate=2;onHold(true)}},350);
 };
 const up=(e:KeyboardEvent)=>{if(e.code!=='ArrowRight'||!pressed)return;e.preventDefault();const seek=!holding&&active();restore();if(seek&&video.readyState>=1){const end=Number.isFinite(video.duration)?video.duration:video.seekable.length?video.seekable.end(video.seekable.length-1):video.currentTime+5;video.currentTime=Math.min(end,video.currentTime+5)}};
 document.addEventListener('keydown',down,true);document.addEventListener('keyup',up,true);window.addEventListener('blur',restore);document.addEventListener('visibilitychange',()=>{if(document.hidden)restore()});for(const event of ['emptied','pause','ended'])video.addEventListener(event,restore);
 return restore;
}
