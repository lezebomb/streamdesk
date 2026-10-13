import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { readSources, validateSources, adapters, searchAll, publicTarget } from './adapters.mjs';
import {browseSources} from './discovery.mjs';
import {discoverRenderers,castEpisode,rendererAction} from './casting.mjs';
import {resultCache} from './result-cache.mjs';
import {cloudConfig} from './cloud-config.mjs';
import {catalogueService} from './catalogue-service.mjs';
const dataRoot=process.env.STREAMDESK_DATA||'data';
const catalogue=catalogueService({indexFile:path.join(dataRoot,'catalogue-index.json'),metadataFile:path.join(dataRoot,'metadata-catalogue.json')});
const results=resultCache(process.env.STREAMDESK_RESULT_CACHE||path.join(dataRoot,'catalog-results.json'));
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
if(!['127.0.0.1','::1'].includes(host))throw Error('StreamDesk 个人服务只允许绑定回环地址');
const ratingChecks=new Map();
const dev=process.argv.includes('--dev');
const vite=dev?await (await import('vite')).createServer({server:{middlewareMode:true},appType:'spa'}):null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8'};
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let data='',bytes=0;for await(const b of req){bytes+=b.length;if(bytes>512*1024)throw new Error('请求过大');data+=b}return JSON.parse(data||'{}');}
const server=http.createServer(async(req,res)=>{
 try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 if(!dev)res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; media-src 'self' https: http: blob:; connect-src 'self' https: http: wss:; frame-src https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 const requestHost=req.headers.host||'';
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost)){send(res,403,{error:'Host 不允许'});return;}
 const url=new URL(req.url,`http://${requestHost}`);
 if(req.headers.origin&&req.headers.origin!==url.origin){send(res,403,{error:'跨站请求不允许'});return;}
 if(req.headers['sec-fetch-site']==='cross-site'){send(res,403,{error:'跨站请求不允许'});return}
 if(/^\/(?:reports|data|research|\.git|\.env)(?:\/|$)/.test(url.pathname)){send(res,404,{error:'文件不存在'});return}
 if(url.pathname.startsWith('/api/')){
  if(req.method==='GET'&&url.pathname==='/api/cloud-config'){send(res,200,await cloudConfig());return}
  const start=performance.now(),controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort()});
  const sources=await readSources();
  const sourceFingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  if(req.method==='GET'&&url.pathname==='/api/sources'){send(res,200,{sources:sources.map(({id,name,type,enabled,priority})=>({id,name,type,enabled,priority}))});return}
  if(req.method==='POST'&&url.pathname==='/api/ratings'){
   const data=await body(req);if(!Array.isArray(data.items)||data.items.length>12||data.verify&&data.items.length!==1)throw Error('评分请求数量无效');
   const list=[];for(const item of data.items){if(typeof item.source!=='string'||item.source.length>40||typeof item.id!=='string'||item.id.length>80)throw Error('作品标识无效');let verify=false;
    if(data.verify){const key=item.source+':'+item.id,now=Date.now();for(const [k,t]of ratingChecks)if(now-t>=60000)ratingChecks.delete(k);if(ratingChecks.has(key)||ratingChecks.size<2){verify=true;ratingChecks.set(key,now)}}
    const rating=await catalogue.rating(item.source,item.id,sources,verify);if(rating)list.push({...item,rating});
   }send(res,200,{ratings:list});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/browse'){
   const category=url.searchParams.get('category')||'推荐',page=Number(url.searchParams.get('page')||1);if(!['推荐','电影','电视剧','动漫','综艺'].includes(category)||!Number.isInteger(page)||page<1||page>1000)throw Error('分类或页码无效');
   const filters={category,...Object.fromEntries(['genre','language','year','sort'].map(k=>[k,(url.searchParams.get(k)||'全部').slice(0,100)])),cursors:JSON.parse((url.searchParams.get('cursors')||'{}').slice(0,2048))};
   if(!filters.cursors||Array.isArray(filters.cursors)||typeof filters.cursors!=='object'||Object.entries(filters.cursors).some(([id,n])=>!sources.some(s=>s.id===id)||!Number.isInteger(n)||n<0||n>4000))throw Error('翻页游标无效');
   res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});res.flushHeaders();const write=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n')};write({type:'start',total:sources.filter(s=>s.enabled&&s.type==='applecms').length});
   await catalogue.browse(sources,filters,page,controller.signal,row=>write({type:'source',row}));write({type:'done',ms:performance.now()-start});res.end();return;
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
    write({type:'done',ms:performance.now()-start});res.end();void catalogue.ingest(rows).catch(()=>{});if(!cached&&!controller.signal.aborted)void results.put(key,rows).catch(()=>{});return;
   }
   const rows=cached||await searchAll(sources,q,controller.signal);void catalogue.ingest(rows).catch(()=>{});send(res,200,{rows,ms:performance.now()-start});if(!cached&&!controller.signal.aborted)void results.put(key,rows).catch(()=>{});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/detail'){
   if(url.searchParams.get('source')==='metadata'){const film=await catalogue.resolve(url.searchParams.get('id'),sources,controller.signal);send(res,200,{film,ms:performance.now()-start});return}
   const source=sources.find(s=>s.id===url.searchParams.get('source')&&s.enabled);if(!source)throw new Error('来源未启用');
   const film=await adapters.get(source.type).detail(source,url.searchParams.get('id'),controller.signal);if(!film)throw new Error('影片不存在');void catalogue.ingest([{list:[film]}]).catch(()=>{});send(res,200,{film,ms:performance.now()-start});return;
  }
  send(res,404,{error:'接口不存在'});return;
 }
 if(vite){vite.middlewares(req,res);return;}
 const root=path.resolve(process.env.STREAMDESK_DIST||'dist');let filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!filename.startsWith(root+path.sep)&&filename!==root)throw new Error('路径无效');
 try{if((await fs.stat(filename)).isDirectory())filename=path.join(filename,'index.html')}catch{filename=path.join(root,'index.html')}
 const file=await fs.readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':path.basename(filename)==='sw.js'?'no-cache':'public,max-age=0'});res.end(file);
 }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.destroy();}
});
server.listen(port,host,()=>console.log(`StreamDesk ${dev?'dev':'production'} http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite?.close();server.close(()=>process.exit())});
