const CACHE='streamdesk-v2';
const PRECACHE=['/','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  // Never cache media, API responses, credentials or cross-origin requests.
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/reports/'))return;
  function remember(key,r){if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)))}return r}
  if(e.request.mode==='navigate')e.respondWith(fetch(e.request).then(r=>remember('/',r)).catch(()=>caches.match('/')));
  else if(u.pathname.startsWith('/assets/')||['/icon.svg','/manifest.webmanifest'].includes(u.pathname)) e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>remember(e.request,r))));
});
