import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { readSources, validateSources, adapters, searchAll, publicTarget } from './adapters.mjs';
import {browseSources} from './discovery.mjs';
import {discoverRenderers,castEpisode,rendererAction} from './casting.mjs';
import {resultCache} from './result-cache.mjs';
import {cloudConfig} from './cloud-config.mjs';
const results=resultCache(process.env.STREAMDESK_RESULT_CACHE||'data/catalog-results.json');
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const dev=process.argv.includes('--dev');
const vite=dev?await (await import('vite')).createServer({server:{middlewareMode:true},appType:'spa'}):null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8'};
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let data='',bytes=0;for await(const b of req){bytes+=b.length;if(bytes>512*1024)throw new Error('请求过大');data+=b}return JSON.parse(data||'{}');}
const server=http.createServer(async(req,res)=>{
 try{
 const requestHost=req.headers.host||'';
 if(!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost)&&host==='127.0.0.1'){send(res,403,{error:'Host 不允许'});return;}
 const url=new URL(req.url,`http://${requestHost}`);
 if(req.headers.origin&&req.headers.origin!==url.origin){send(res,403,{error:'跨站请求不允许'});return;}
 if(url.pathname.startsWith('/api/')){
  if(req.method==='GET'&&url.pathname==='/api/cloud-config'){send(res,200,await cloudConfig());return}
  const start=performance.now(),controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort()});
  const sources=await readSources();
  const sourceFingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  if(req.method==='GET'&&url.pathname==='/api/sources'){const presets=validateSources(JSON.parse(await fs.readFile('data/sources.example.json','utf8')));send(res,200,{sources,presets});return}
  if(req.method==='PUT'&&url.pathname==='/api/sources'){
   const next=validateSources((await body(req)).sources);for(const s of next)if(s.type==='applecms')await publicTarget(s.api);
   await fs.writeFile('data/sources.json.tmp',JSON.stringify(next,null,2));await fs.rename('data/sources.json.tmp','data/sources.json');send(res,200,{sources:next});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/browse'){
   const category=url.searchParams.get('category')||'推荐',page=Number(url.searchParams.get('page')||1);if(!['推荐','电影','电视剧','动漫','综艺'].includes(category)||!Number.isInteger(page)||page<1||page>1000)throw Error('分类或页码无效');
   res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});res.flushHeaders();const write=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n')};write({type:'start',total:sources.filter(s=>s.enabled&&s.type==='applecms').length});const filters=Object.fromEntries(['genre','language','year','sort'].map(k=>[k,(url.searchParams.get(k)||'全部').slice(0,100)]));const cursors=JSON.parse((url.searchParams.get('cursors')||'{}').slice(0,2048));if(!cursors||Array.isArray(cursors)||typeof cursors!=='object'||Object.entries(cursors).some(([id,n])=>!sources.some(s=>s.id===id)||!Number.isInteger(n)||n<0||n>4000))throw Error('翻页游标无效');filters.cursors=cursors;const key=JSON.stringify(['browse-v3',sourceFingerprint,category,page,filters]);const cached=await results.get(key);let rows;
   if(cached){rows=cached;for(const row of rows)write({type:'source',row})}else {if(page===1){const indexed=await results.query({...filters,category,sort:filters.sort==='score'?'score':'latest'},sources.filter(s=>s.enabled).map(s=>s.id),sourceFingerprint);if(indexed.length)write({type:'source',row:{sourceId:'cached-index',ok:true,ms:0,list:indexed,hasMore:true,cached:true}})}rows=await browseSources(sources,category,page,controller.signal,row=>write({type:'source',row}),filters)}
   write({type:'done',ms:performance.now()-start,cached:!!cached});res.end();if(!cached&&!controller.signal.aborted)void results.put(key,rows).catch(()=>{});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/cast/devices'){send(res,200,{devices:await discoverRenderers()});return}
  if(req.method==='POST'&&url.pathname==='/api/cast/play'){
   const data=await body(req),source=sources.find(s=>s.id===data.source&&s.enabled);if(!source)throw Error('来源未启用');const film=await adapters.get(source.type).detail(source,String(data.id),controller.signal);const episode=film?.groups?.filter(g=>!data.groupId||g.id===data.groupId).flatMap(g=>g.episodes).find(e=>e.key===data.episodeKey)||film?.episodes.find(e=>e.key===data.episodeKey&&(!data.groupId||e.groupId===data.groupId));if(!episode)throw Error('未找到当前选集');send(res,200,await castEpisode(data.deviceId,film,episode,data.position));return;
  }
  if(req.method==='POST'&&url.pathname==='/api/cast/control'){const data=await body(req);if(!['Play','Pause','Stop'].includes(data.action))throw Error('不支持的投屏操作');await rendererAction(data.deviceId,data.action,data.action==='Play'?{Speed:1}:{});send(res,200,{commandAccepted:true});return}
  if(req.method==='GET'&&url.pathname==='/api/search'){
   const q=(url.searchParams.get('q')||'').slice(0,100);
   const key=JSON.stringify(['search-v2',sourceFingerprint,q.trim()]),cached=await results.get(key);
   if(url.searchParams.get('stream')==='1'){
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.flushHeaders();
    const write=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n')};
    write({type:'start',total:sources.filter(s=>s.enabled&&(s.type!=='applecms'||q.trim())).length});
    const rows=cached||await searchAll(sources,q,controller.signal,row=>write({type:'source',row}));if(cached)for(const row of rows)write({type:'source',row});
    write({type:'done',ms:performance.now()-start});res.end();if(!cached&&!controller.signal.aborted)void results.put(key,rows).catch(()=>{});return;
   }
   const rows=cached||await searchAll(sources,q,controller.signal);send(res,200,{rows,ms:performance.now()-start});if(!cached&&!controller.signal.aborted)void results.put(key,rows).catch(()=>{});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/detail'){
   const source=sources.find(s=>s.id===url.searchParams.get('source')&&s.enabled);if(!source)throw new Error('来源未启用');
   const film=await adapters.get(source.type).detail(source,url.searchParams.get('id'),controller.signal);if(!film)throw new Error('影片不存在');send(res,200,{film,ms:performance.now()-start});return;
  }
  send(res,404,{error:'接口不存在'});return;
 }
 if(url.pathname.startsWith('/reports/')){const basename=path.basename(url.pathname);if(!/\.(json|md|png)$/.test(basename))throw new Error('格式不支持');const file=await fs.readFile(path.join('reports',basename));res.writeHead(200,{'Content-Type':mime[path.extname(basename)]||'application/octet-stream'});res.end(file);return;}
 if(vite){vite.middlewares(req,res);return;}
 let filename=path.resolve('dist','.'+decodeURIComponent(url.pathname));const root=path.resolve('dist');if(!filename.startsWith(root+path.sep)&&filename!==root)throw new Error('路径无效');
 try{if((await fs.stat(filename)).isDirectory())filename=path.join(filename,'index.html')}catch{filename=path.join(root,'index.html')}
 const file=await fs.readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':path.basename(filename)==='sw.js'?'no-cache':'public,max-age=0'});res.end(file);
 }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.destroy();}
});
server.listen(port,host,()=>console.log(`StreamDesk ${dev?'dev':'production'} http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite?.close();server.close(()=>process.exit())});
