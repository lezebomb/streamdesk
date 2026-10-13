// A full screen-width drag seeks 30 seconds; short drags make small adjustments.
export function dragSeekPosition(start:number,deltaX:number,width:number,duration:number){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||width<=0)return null;
 const delta=Math.round(Math.max(-30,Math.min(30,deltaX/width*30)));
 return Math.max(0,Math.min(Math.max(0,duration-.1),start+delta));
}
export function playbackTime(seconds:number){if(!Number.isFinite(seconds)||seconds<0)return '00:00';const n=Math.floor(seconds);return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
