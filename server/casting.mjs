import {poolMap} from '../shared/policy.ts';
import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
const registry=new Map();let discoveryPromise=null,lastDiscovery=0;
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x]));
export function lanAddress(ip){if(!net.isIPv4(ip))return false;const [a,b]=ip.split('.').map(Number);return a===10||a===192&&b===168||a===172&&b>=16&&b<=31}
function field(text,name){return decode(text.match(new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,'i'))?.[1]?.trim()||'')}
export function rendererDescriptor(text,location,address){
 if(text.length>128*1024||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('无效设备描述');const loc=new URL(location);if(loc.protocol!=='http:'||loc.hostname!==address||!lanAddress(address))throw Error('设备描述地址不属于发现的局域网设备');
 const services=[...text.matchAll(/<(?:[\w-]+:)?service\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?service>/gi)];
 const service=services.find(s=>/^urn:schemas-upnp-org:service:AVTransport:[12]$/.test(field(s[1],'serviceType')));if(!service)return null;
 const base=field(text,'URLBase')||loc.href,control=new URL(field(service[1],'controlURL'),base);if(control.protocol!=='http:'||control.hostname!==address||control.username||control.password)throw Error('设备控制地址不属于发现设备');
 return {name:field(text,'friendlyName').replace(/<[^>]+>/g,'').slice(0,100)||'DLNA 电视',control:control.href,service:field(service[1],'serviceType'),address};
}
async function boundedText(response,max=128*1024){if(!response.ok)throw Error(`电视返回 HTTP ${response.status}`);let text='',bytes=0;for await(const b of response.body){bytes+=b.length;if(bytes>max)throw Error('电视响应过大');text+=Buffer.from(b).toString('utf8')}return text}
export async function discoverRenderers(){
 if(discoveryPromise)return discoveryPromise;if(Date.now()-lastDiscovery<10000)return list();lastDiscovery=Date.now();
 discoveryPromise=(async()=>{const found=new Map(),sockets=[];const addresses=Object.values(os.networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&!i.internal&&lanAddress(i.address));
  await Promise.all(addresses.map(iface=>new Promise(resolve=>{const socket=dgram.createSocket('udp4');sockets.push(socket);const timer=setTimeout(()=>{socket.close();resolve()},3500);socket.on('error',()=>{clearTimeout(timer);try{socket.close()}catch{}resolve()});socket.on('message',(msg,remote)=>{if(msg.length>8192||!lanAddress(remote.address))return;const location=msg.toString().match(/^location:\s*(.+)$/im)?.[1]?.trim();if(!location||found.size>=12)return;try{const u=new URL(location);if(u.hostname===remote.address&&u.protocol==='http:')found.set(location,remote.address)}catch{}});socket.bind(0,iface.address,()=>{socket.setMulticastInterface(iface.address);socket.setMulticastTTL(2);socket.send('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n',1900,'239.255.255.250')})})));
  // Descriptor fetches are bounded and tied to the sender's RFC1918 address.
  await poolMap([...found],2,async([location,address])=>{try{const r=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(1800)}),device=rendererDescriptor(await boundedText(r),location,address);if(device){const id=crypto.createHash('sha256').update(location).digest('hex').slice(0,24);registry.set(id,{...device,seenAt:Date.now()})}}catch{}});
  return list();
 })().finally(()=>discoveryPromise=null);return discoveryPromise;
}
function list(){for(const [id,d]of registry)if(Date.now()-d.seenAt>5*60*1000)registry.delete(id);return [...registry].map(([id,d])=>({id,name:d.name}))}
export async function rendererAction(deviceId,action,args={}){list();const d=registry.get(deviceId);if(!d)throw Error('电视已离线，请重新查找');if(!['SetAVTransportURI','Play','Pause','Stop','Seek','GetTransportInfo','GetPositionInfo'].includes(action))throw Error('不支持此投屏操作');const content=Object.entries({InstanceID:0,...args}).map(([k,v])=>`<${k}>${xml(v)}</${k}>`).join('');const body=`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${d.service}">${content}</u:${action}></s:Body></s:Envelope>`;
 const r=await fetch(d.control,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'text/xml; charset="utf-8"',SOAPAction:`"${d.service}#${action}"`},body});const result=await boundedText(r);if(/<(?:\w+:)?Fault\b/.test(result))throw Error('电视拒绝命令：'+(field(result,'errorDescription')||field(result,'errorCode')));return result;
}
export async function castEpisode(deviceId,film,episode,position){const u=new URL(episode.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hostname==='localhost'||net.isIP(u.hostname))throw Error('此媒体地址无法投屏');if(episode.kind==='embed')throw Error('嵌入式线路无法交给电视');
 const type=episode.kind==='hls'?'application/vnd.apple.mpegurl':'video/mp4';const metadata=`<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="0" restricted="1"><dc:title>${xml(film.title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:${type}:*">${xml(u.href)}</res></item></DIDL-Lite>`;
 await rendererAction(deviceId,'SetAVTransportURI',{CurrentURI:u.href,CurrentURIMetaData:metadata});await rendererAction(deviceId,'Play',{Speed:1});let seekAccepted=false;
 if(Number.isFinite(position)&&position>0){const seconds=Math.floor(Math.min(position,86400)),target=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');try{await rendererAction(deviceId,'Seek',{Unit:'REL_TIME',Target:target});seekAccepted=true}catch{}}
 return {commandAccepted:true,seekAccepted,verifiedPicture:false};
}
