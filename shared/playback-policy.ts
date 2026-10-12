export interface DeviceNetwork {memoryGB?:number;saveData?:boolean;effectiveType?:string;downlinkMbps?:number;rttMs?:number}
export function playbackPolicy(input:DeviceNetwork={}) {
 const constrained=input.saveData||['slow-2g','2g','3g'].includes(input.effectiveType||'')||(input.memoryGB!==undefined&&input.memoryGB<=2);
 const mbps=input.downlinkMbps&&input.downlinkMbps>0?input.downlinkMbps:undefined;
 return {profile:constrained?'constrained':'balanced',targetBufferSeconds:constrained?18:30,maxBufferSeconds:constrained?35:60,backBufferSeconds:constrained?8:20,maxBufferBytes:(constrained?18:30)*1e6,
  bandwidthEstimate:Math.max(150000,Math.min(25000000,(mbps??.5)*1e6*.7)),startupDeadlineMs:Math.max(18000,Math.min(30000,18000+(input.rttMs||0)*8)),stallDeadlineMs:constrained?12000:8000,seekDeadlineMs:constrained?20000:15000};
}
