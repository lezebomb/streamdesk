export function bindVideoGestures(wrapper:HTMLElement,video:HTMLVideoElement,hint:HTMLElement){
 let timer:ReturnType<typeof setTimeout>|undefined,pointer:number|undefined,x=0,y=0,lastTap=0,lastX=0,lastY=0,holding=false,saved=1,suppressUntil=0;
 const show=(s:string)=>{hint.textContent=s;hint.hidden=!s};
 const release=()=>{clearTimeout(timer);timer=undefined;if(holding){video.playbackRate=saved;holding=false;suppressUntil=performance.now()+500}show('');pointer=undefined};
 wrapper.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||video.hidden||e.target!==video&&!(e.target as HTMLElement).classList.contains('gesture-surface')||e.isPrimary===false)return;
  const box=video.getBoundingClientRect();if(e.clientY>box.bottom-56)return;pointer=e.pointerId;x=e.clientX;y=e.clientY;saved=video.playbackRate;
  if(x>box.left+box.width/2)timer=setTimeout(()=>{if(pointer!==undefined&&!video.paused){holding=true;video.playbackRate=Math.max(2,saved);show(`${video.playbackRate}× 快进中`)}},450);
 });
 wrapper.addEventListener('pointermove',e=>{if(e.pointerId===pointer&&Math.hypot(e.clientX-x,e.clientY-y)>18)release()});
 wrapper.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;const now=performance.now(),held=holding;release();if(held)return;
  if(now-lastTap<300&&Math.hypot(e.clientX-lastX,e.clientY-lastY)<48){if(video.paused)void video.play().catch(()=>{});else video.pause();lastTap=0;suppressUntil=now+500;show(video.paused?'已暂停':'继续播放');setTimeout(()=>show(''),900)}else{lastTap=now;lastX=e.clientX;lastY=e.clientY}
 });
 wrapper.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation()}},true);
 wrapper.addEventListener('contextmenu',e=>{if(holding)e.preventDefault()});
 for(const type of ['pointercancel','lostpointercapture'])wrapper.addEventListener(type,release);
 const playButton=wrapper.querySelector<HTMLButtonElement>('#touch-play');const refresh=()=>{if(playButton)playButton.hidden=!video.paused||video.hidden};if(playButton)playButton.onclick=()=>void video.play().catch(()=>{});video.addEventListener('pause',refresh);video.addEventListener('play',refresh);video.addEventListener('emptied',refresh);
 window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});video.addEventListener('emptied',release);video.addEventListener('pause',()=>{if(holding)release()});
}
