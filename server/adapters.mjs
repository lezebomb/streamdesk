import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import { parseSearchList, parseDetail, isRelevant, isAdultContent } from '../src/vendor/cms-parser.ts';
import { catalog } from './catalog.mjs';
import { poolMap } from '../shared/policy.ts';
export async function readSources(){let raw;try{raw=await fs.readFile('data/sources.json','utf8')}catch{raw=await fs.readFile('data/sources.example.json','utf8')}return validateSources(JSON.parse(raw));}
export function validateSources(sources){
 if(!Array.isArray(sources)||sources.length>20)throw new Error('最多配置 20 个来源');
 const ids=new Set();return sources.map(s=>{
  if(!s||!/^[a-z0-9_-]{1,40}$/i.test(s.id)||ids.has(s.id)||typeof s.name!=='string'||s.name.length>100||!['catalog','applecms','embed'].includes(s.type))throw new Error('来源配置无效或 ID 重复');ids.add(s.id);
  if(s.type==='catalog'&&!['hls','mp4','backup','blender'].includes(s.catalog))throw new Error('不支持的公开目录');
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
// This machine's VPN returns paired 198.18/15 + fdfe:dcba:9876 virtual DNS addresses.
// Exception is limited to these verified provider hostnames, these exact virtual ranges,
// and configured API calls. Other private hosts/IPs and all redirects remain blocked.
const proxyDnsHosts=new Set(['bfzyapi.com','cj.lziapi.com','api.ffzyapi.com']);
function permittedVirtual(host,ip){return proxyDnsHosts.has(host)&&(/^(198\.1[89]\.)/.test(ip)||/^fdfe:dcba:9876:/i.test(ip));}
export async function publicTarget(url){const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('只接受公开 HTTP(S)');let timer;const answers=await Promise.race([dns.lookup(u.hostname.replace(/^\[|\]$/g,''),{all:true}),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('DNS 超时')),3000))]).finally(()=>clearTimeout(timer));if(!answers.length||answers.some(a=>blocked(a.address)&&!permittedVirtual(u.hostname,a.address)))throw new Error('不允许请求内网或保留地址');return u;}
// Only requests to administrator-configured API origins, no arbitrary proxy or rewritten headers.
async function cmsFetch(source,params,signal){
 const u=await publicTarget(source.api);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),headers:{Accept:'application/json'}});
 if(!r.ok)throw new Error(`HTTP ${r.status}`);
 const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.byteLength;if(bytes>2*1024*1024)throw new Error('API 响应过大');chunks.push(Buffer.from(chunk))}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sourceShape(s){return {key:s.id,name:s.name,url:s.api};}
function mediaKind(url){try{const p=new URL(url).pathname.toLowerCase();return p.endsWith('.m3u8')?'hls':p.endsWith('.mp4')?'mp4':null}catch{return null}}
function category(s){return /动漫|动画/.test(s)?'动漫':/片|电影/.test(s)?'电影':/剧/.test(s)?'电视剧':s;}
function canonical(row){return Number(row?.vod_douban_id)>0?`douban:${row.vod_douban_id}`:undefined;}
const memo=new Map();
export function clearCache(){memo.clear()}
async function cached(key,fn){const old=memo.get(key);if(old&&old.until>Date.now())return old.value;const value=await fn();memo.set(key,{until:Date.now()+60000,value});if(memo.size>300)memo.delete(memo.keys().next().value);return value}
export const adapters=new Map([
 ['catalog',{search:async(s,q)=>catalog(s).filter(f=>!q||f.title.toLowerCase().includes(q.toLowerCase())),detail:async(s,id)=>catalog(s).find(f=>f.id===id)}],
 ['embed',{search:async(s,q)=>(s.items||[]).map(f=>({...f,sourceId:s.id})).filter(f=>!q||f.title.toLowerCase().includes(q.toLowerCase())),detail:async(s,id)=>{const f=s.items.find(f=>f.id===id);return f?{...f,sourceId:s.id}:undefined}}],
 ['applecms',{search:async(s,q,signal)=>{if(!q)return [];const raw=await cached(`search:${s.api}:${q}`,()=>cmsFetch(s,{ac:'videolist',wd:q,pg:'1'},signal));return parseSearchList(raw,sourceShape(s)).filter(f=>isRelevant(f.name,q)&&!isAdultContent(f.typeName)).map(f=>{const row=raw.list.find(x=>String(x.vod_id)===f.vodId);return {id:f.vodId,sourceId:s.id,title:f.name,canonicalId:canonical(row),year:String(row?.vod_year||'').match(/\d{4}/)?.[0],category:category(f.typeName||''),poster:f.pic,episodes:[]}})},detail:async(s,id,signal)=>{
  const raw=await cached(`detail:${s.api}:${id}`,()=>cmsFetch(s,{ac:'videolist',ids:id},signal)),d=parseDetail(raw,sourceShape(s)),row=raw.list[0];
  // Use LibreTV's parsed media line. Preserve labels and explicitly classify direct media.
  const groups=String(row.vod_play_url||'').split('$$$').map(g=>g.split('#').map(part=>{const i=part.indexOf('$');return {label:part.slice(0,i),url:part.slice(i+1)}}));
  const chosen=groups.find(g=>g.some(e=>d.episodes.includes(e.url)))||[];
  return {id:String(row.vod_id),sourceId:s.id,title:row.vod_name,year:String(row.vod_year||'').match(/\d{4}/)?.[0],category:category(row.type_name||''),poster:row.vod_pic,canonicalId:canonical(row),description:String(row.vod_content||'').replace(/<[^>]*>/g,''),episodes:chosen.flatMap((e,i)=>{
   const kind=mediaKind(e.url);if(!kind)return [];const seasonMatch=e.label.match(/S(\d+)\s*E(\d+)/i)||e.label.match(/第\s*(\d+)\s*季.*第\s*(\d+)\s*集/);const m=e.label.match(/(?:第\s*)?(\d+)\s*[集话話期]/)||e.label.match(/^(?:EP?|Episode\s*)?(\d{1,3})$/i);const season=seasonMatch?Number(seasonMatch[1]):undefined;const number=seasonMatch?Number(seasonMatch[2]):m?Number(m[1]):undefined;
   return [{key:category(row.type_name||'')==='电影'&&chosen.length===1?'feature':number===undefined?`label:${e.label}`:`${season===undefined?'':`season:${season}:`}episode:${number}`,label:e.label||`第 ${i+1} 集`,url:e.url,kind,season,number}];})};
 }}]
]);
export async function searchAll(sources,q,signal){return poolMap(sources.filter(s=>s.enabled&&(s.type!=='applecms'||q.trim())),2,async s=>{const t=performance.now();try{const list=await adapters.get(s.type).search(s,q,signal);return {sourceId:s.id,ok:true,ms:performance.now()-t,list}}catch(e){return {sourceId:s.id,ok:false,ms:performance.now()-t,list:[],error:e.message}}});}
