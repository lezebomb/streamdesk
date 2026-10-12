import type {Episode,Film,Health} from './model';
import type {MediaProbe} from './media-probe';
import {blankHealth,healthScore} from './policy.ts';
export interface Candidate {film:Film;episode:Episode;probe?:MediaProbe;decodedHeight?:number}
export const candidateKey=(c:Candidate)=>c.episode.url;
export function mediaDomain(c:Candidate){return c.probe?.segmentHost||new URL(c.episode.url).hostname;}
export function candidateScore(c:Candidate,health:Record<string,Health>,failedDomain?:string,now=Date.now()){
 const h=health[c.film.sourceId+'|'+new URL(c.episode.url).hostname]||health[c.film.sourceId]||blankHealth();
 if(h.cooldownUntil>now)return -1000;
 const probe=c.probe&&now-c.probe.checkedAt<60000?c.probe:undefined;
 if(probe&&!probe.ok)return -500;
 const score=healthScore(h,now)+(probe?.ok?25:0)+(probe?.ok?Math.max(0,8-probe.ms/1000):0);
 // Different API names do not prove independent delivery. Prefer a different measured
 // segment host after failure; never count duplicate media URLs as new backups.
 return score+(c.decodedHeight?Math.min(4,c.decodedHeight/1080*4):0)+(failedDomain&&mediaDomain(c)!==failedDomain?8:0);
}
export function uniqueCandidates(candidates:Candidate[]){const seen=new Set<string>();return candidates.filter(c=>{const key=candidateKey(c);if(seen.has(key))return false;seen.add(key);return true});}
