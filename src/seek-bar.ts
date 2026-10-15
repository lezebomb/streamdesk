import {playbackTime} from '../shared/gesture-policy';

// Commit before releasing scrubbing: pointerup can precede a range's native change.
export function bindSeekBar(seek:HTMLInputElement,video:HTMLVideoElement,time:HTMLElement,changed:(scrubbing:boolean)=>void){
 let pointer:number|undefined,scrubbing=false;
 const preview=()=>{time.textContent=playbackTime(Number(seek.value))+' / '+playbackTime(video.duration)};
 const update=()=>{seek.disabled=!Number.isFinite(video.duration)||video.duration<=0;if(!scrubbing){seek.max=String(seek.disabled?0:video.duration);seek.value=String(video.currentTime||0);preview()}};
 const point=(clientX:number)=>{const box=seek.getBoundingClientRect(),inset=Math.min(8,box.width/2);if(box.width<=2*inset)return;seek.value=String(Math.max(0,Math.min(1,(clientX-box.left-inset)/(box.width-2*inset)))*video.duration);preview()};
 const finish=(commit:boolean)=>{const id=pointer;pointer=undefined;if(commit&&!seek.disabled){const position=Number(seek.value);if(Number.isFinite(position))video.currentTime=Math.max(0,Math.min(video.duration-.1,position))}scrubbing=false;if(id!==undefined&&seek.hasPointerCapture(id))seek.releasePointerCapture(id);update();changed(false)};
 seek.addEventListener('pointerdown',e=>{if(seek.disabled||!e.isPrimary||e.button!==0)return;e.preventDefault();pointer=e.pointerId;scrubbing=true;changed(true);seek.setPointerCapture(e.pointerId);point(e.clientX)});
 seek.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();point(e.clientX)}});
 seek.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();point(e.clientX);finish(true)});
 for(const event of ['pointercancel','lostpointercapture'])seek.addEventListener(event,()=>{if(pointer!==undefined)finish(false)});
 seek.addEventListener('input',()=>{scrubbing=true;changed(true);preview()});
 seek.addEventListener('change',()=>finish(true));
 for(const event of ['timeupdate','durationchange','loadedmetadata','seeked'])video.addEventListener(event,update);
 video.addEventListener('emptied',()=>finish(false));update();
}
