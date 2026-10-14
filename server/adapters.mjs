import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import {createAppleCmsAdapter} from '../shared/source-adapter.ts';
import {cacheCmsTransport} from '../shared/source-cache.ts';
import { catalog } from './catalog.mjs';
import {searchSources} from '../shared/source-search.ts';
import {networkSlot} from './network-pool.mjs';
import {runtimeConfig} from './runtime-config.mjs';
const configuredSourceFile=runtimeConfig.sourceRequired,sourceFile=runtimeConfig.sourceFile;
export async function readSources(){
 if(configuredSourceFile)return validateSources(JSON.parse(await fs.readFile(sourceFile,'utf8')));
 let defaults=[];if(runtimeConfig.defaults)defaults=validateSources(JSON.parse(await fs.readFile('data/sources.example.json','utf8')));let saved=[];try{saved=validateSources(JSON.parse(await fs.readFile(sourceFile,'utf8')))}catch(e){if(e.code!=='ENOENT')throw e}
 // Upgrade the verified defaults without deleting private configuration. Test fixtures
 // are available only via explicit STREAMDESK_SOURCES, never in the consumer catalog.
 const merged=new Map(saved.filter(s=>s.type!=='catalog').map(s=>[s.id,s]));for(const s of defaults)if(s.enabled)merged.set(s.id,{...merged.get(s.id),...s});return [...merged.values()];
}
export function validateSources(sources){
 if(!Array.isArray(sources)||sources.length>20)throw new Error('最多配置 20 个来源');
 const ids=new Set();return sources.map(s=>{
  if(!s||!/^[a-z0-9_-]{1,40}$/i.test(s.id)||ids.has(s.id)||typeof s.name!=='string'||s.name.length>100||!['catalog','applecms','embed'].includes(s.type))throw new Error('来源配置无效或 ID 重复');ids.add(s.id);
  if(s.priority!==undefined&&(!Number.isFinite(s.priority)||s.priority< -10||s.priority>10))throw new Error('来源优先级必须在 -10 到 10 之间');
  if(s.type==='catalog'&&!['hls','mp4','backup','blender','quality'].includes(s.catalog))throw new Error('不支持的公开目录');
  if(s.type==='applecms'){const u=new URL(s.api);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('API 必须是公开 HTTP(S) 地址');}
  if(s.type==='embed'){if(!Array.isArray(s.items)||s.items.length>100)throw new Error('Embed items 必须是最多 100 个影片的数组');for(const f of s.items){if(typeof f.title!=='string'||!Array.isArray(f.episodes)||!f.id)throw new Error('Embed 影片格式错误');for(const e of f.episodes){const u=new URL(e.url);if(u.protocol!=='https:'||e.kind!=='embed'||!e.key||!e.label)throw new Error('Embed 只接受 HTTPS 页面地址');}}}
  return {...s,enabled:s.enabled===true};
 });
}
function blocked(ip){
 if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===100&&b>=64&&b<=127)||(a===198&&[18,19,51].includes(b))||(a===203&&b===0)}
 // Restrict to global IPv6 2000::/3; reject mapped IPv4 and local ranges.
 return !/^[23][0-9a-f]{3}:/i.test(ip)||/^2001:db8:/i.test(ip);
}
// Optional owner-maintained virtual DNS exceptions stay in ignored local configuration.
// All other private/loopback targets and cross-origin redirects remain blocked.
let dnsExceptions={proxyDnsHosts:[],virtualIpv6Prefix:''};try{dnsExceptions=JSON.parse(await fs.readFile(runtimeConfig.securityFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
function permittedVirtual(host,ip){return dnsExceptions.proxyDnsHosts?.includes(host)&&(/^(198\.1[89]\.)/.test(ip)||dnsExceptions.virtualIpv6Prefix&&ip.toLowerCase().startsWith(dnsExceptions.virtualIpv6Prefix.toLowerCase()));}
export async function publicTarget(url){const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('只接受公开 HTTP(S)');let timer;const answers=await Promise.race([dns.lookup(u.hostname.replace(/^\[|\]$/g,''),{all:true}),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('DNS 超时')),3000))]).finally(()=>clearTimeout(timer));if(!answers.length||answers.some(a=>blocked(a.address)&&!permittedVirtual(u.hostname,a.address)))throw new Error('不允许请求内网或保留地址');return u;}
// Only requests to administrator-configured API origins, no arbitrary proxy or rewritten headers.
async function cmsFetch(source,params,signal){
 const u=await publicTarget(source.api);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)].filter(Boolean)),headers:{Accept:'application/json'}});
 if(!r.ok)throw new Error(`HTTP ${r.status}`);
 const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.byteLength;if(bytes>2*1024*1024)throw new Error('API 响应过大');chunks.push(Buffer.from(chunk))}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const cmsCache=cacheCmsTransport((source,params,signal)=>networkSlot(()=>cmsFetch(source,params,signal),signal));
export function clearCache(){cmsCache.clear()}
export const adapters=new Map([
 ['catalog',{search:async(s,q)=>catalog(s).filter(f=>!q||f.title.toLowerCase().includes(q.toLowerCase())),detail:async(s,id)=>catalog(s).find(f=>f.id===id)}],
 ['embed',{search:async(s,q)=>(s.items||[]).map(f=>({...f,sourceId:s.id})).filter(f=>!q||f.title.toLowerCase().includes(q.toLowerCase())),detail:async(s,id)=>{const f=s.items.find(f=>f.id===id);return f?{...f,sourceId:s.id}:undefined}}],
 ['applecms',createAppleCmsAdapter(cmsCache.fetch)]
]);
export async function searchAll(sources,q,signal,onRow=()=>{}){return searchSources(sources,q,adapters,signal,onRow)}
