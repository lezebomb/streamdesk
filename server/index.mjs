import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readSources, validateSources, adapters, searchAll, publicTarget } from './adapters.mjs';
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
  const start=performance.now(),controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort()});
  const sources=await readSources();
  if(req.method==='GET'&&url.pathname==='/api/sources'){const presets=validateSources(JSON.parse(await fs.readFile('data/sources.example.json','utf8')));send(res,200,{sources,presets});return}
  if(req.method==='PUT'&&url.pathname==='/api/sources'){
   const next=validateSources((await body(req)).sources);for(const s of next)if(s.type==='applecms')await publicTarget(s.api);
   await fs.writeFile('data/sources.json.tmp',JSON.stringify(next,null,2));await fs.rename('data/sources.json.tmp','data/sources.json');send(res,200,{sources:next});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/search'){
   const q=(url.searchParams.get('q')||'').slice(0,100);
   if(url.searchParams.get('stream')==='1'){
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.flushHeaders();
    const write=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n')};
    write({type:'start',total:sources.filter(s=>s.enabled&&(s.type!=='applecms'||q.trim())).length});
    await searchAll(sources,q,controller.signal,row=>write({type:'source',row}));
    write({type:'done',ms:performance.now()-start});res.end();return;
   }
   const rows=await searchAll(sources,q,controller.signal);send(res,200,{rows,ms:performance.now()-start});return;
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
