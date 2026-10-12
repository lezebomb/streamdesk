export interface Episode {key:string;label:string;url:string;kind:'hls'|'mp4'|'embed';season?:number;number?:number;part?:string;groupId?:string}
export interface PlaybackGroup {id:string;name:string;episodes:Episode[];unsupported:number}
export interface Film {id:string;sourceId:string;title:string;canonicalId?:string;year?:string;season?:number;category?:string;description?:string;poster?:string;episodes:Episode[];groups?:PlaybackGroup[]}
export interface Source {id:string;name:string;type:'catalog'|'applecms'|'embed';enabled:boolean;priority?:number;api?:string;items?:Film[]}
export interface Health {apiSamples:number;apiFailures:number;apiMs:number|null;playSamples:number;playFailures:number;startupMs:number|null;mbps:number|null;stallMs:number;watchMs:number;cooldownUntil:number;failStreak:number;updatedAt:number}
export interface Metrics {firstFrameMs:number|null;stallMs:number;stalls:number;watchMs:number;seekMs:number[];fragments:{url:string;bytes:number;ms:number;mbps:number;mediaMbps?:number}[];errors:{type:string;details:string;at:number;httpStatus?:number}[];switches:number;frames:number;droppedFrames:number}
export interface SearchRow {sourceId:string;ok:boolean;ms:number;list:Film[];error?:string}
