export interface Episode {key:string;label:string;url:string;kind:'hls'|'mp4'|'embed';season?:number;number?:number}
export interface Film {id:string;sourceId:string;title:string;canonicalId?:string;year?:string;category?:string;description?:string;poster?:string;episodes:Episode[]}
export interface Source {id:string;name:string;type:'catalog'|'applecms'|'embed';enabled:boolean;api?:string;items?:Film[]}
export interface Health {apiSamples:number;apiFailures:number;apiMs:number|null;playSamples:number;playFailures:number;startupMs:number|null;mbps:number|null;stallMs:number;watchMs:number;cooldownUntil:number;failStreak:number;updatedAt:number}
export interface Metrics {firstFrameMs:number|null;stallMs:number;stalls:number;watchMs:number;seekMs:number[];fragments:{url:string;bytes:number;ms:number;mbps:number}[];errors:{type:string;details:string;at:number}[];switches:number;frames:number;droppedFrames:number}
