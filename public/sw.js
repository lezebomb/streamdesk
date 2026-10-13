const CACHE='streamdesk-v2';
const PRECACHE=['/','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('streamdesk-v2')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===self.location.origin&&u.pathname.startsWith('/offline/')){e.respondWith(caches.open('streamdesk-downloads-v1').then(c=>c.match(e.request)).then(async r=>{if(!r)return new Response('离线文件不存在',{status:404});const range=e.request.headers.get('Range');if(!range)return r;const blob=await r.blob(),match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)return new Response('',{status:416});const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),blob.size-1):blob.size-1;if(start>end||start>=blob.size)return new Response('',{status:416,headers:{'Content-Range':'bytes */'+blob.size}});return new Response(blob.slice(start,end+1,blob.type),{status:206,headers:{'Content-Type':blob.type,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${blob.size}`,'Accept-Ranges':'bytes'}})}));return;}
  // Never automatically cache media, API responses, credentials or cross-origin requests.
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/reports/'))return;
  function remember(key,r){if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)))}return r}
  if(e.request.mode==='navigate')e.respondWith(fetch(e.request).then(r=>remember('/',r)).catch(()=>caches.match('/')));
  else if(u.pathname.startsWith('/assets/')||['/icon.svg','/manifest.webmanifest'].includes(u.pathname)) e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>remember(e.request,r))));
});
