import fs from 'node:fs/promises';
import {cmsFilm,playbackGroups} from '../shared/cms.ts';
import {poolMap} from '../shared/policy.ts';
import {probeMedia} from '../shared/media-probe.ts';
const dir=process.env.RUN_DIR||'reports/runs/expansion-discovery';await fs.mkdir(dir,{recursive:true});
const sources=JSON.parse(await fs.readFile('data/expansion-sources.json','utf8'));
const report={at:new Date().toISOString(),concurrency:2,timeoutMs:8000,sources:[]};
await poolMap(sources,2,async source=>{
 const row={sourceId:source.id,api:source.api,documentation:source.documentation,samples:[]};report.sources.push(row);
 try{const r=await fetch(source.documentation,{signal:AbortSignal.timeout(8000)}),s=await r.text();row.docStatus=r.status;row.documentedApi=s.includes(new URL(source.api).hostname);await fs.writeFile(`${dir}/${source.id}-docs.html`,s)}catch(e){row.docError=e.message}
 // Three representative works gate wider testing. No mirror rewriting or special headers.
 for(const title of ['流浪地球','爱情公寓','葬送的芙莉莲']){const t=performance.now(),sample={title};row.samples.push(sample);try{
  const u=new URL(source.api);u.searchParams.set('ac','videolist');u.searchParams.set('wd',title);
  const r=await fetch(u,{signal:AbortSignal.timeout(8000)});sample.status=r.status;const raw=await r.json();sample.apiMs=performance.now()-t;
  const films=(raw.list||[]).map(x=>cmsFilm(x,source.id));sample.hits=films.map(({episodes,groups,...f})=>f);
  const f=films.find(x=>x.title===title)||(title==='爱情公寓'?films.find(x=>/爱情公寓(?:3|第三季)$/.test(x.title)):null);
  if(f){sample.film=f;sample.media=[];for(const g of playbackGroups(f).slice(0,1))sample.media.push({episode:g.episodes[0],probe:await probeMedia(g.episodes[0],AbortSignal.timeout(8000))})}
 }catch(e){sample.error=e.message}console.log(JSON.stringify({source:source.id,title,api:sample.status,media:sample.media?.map(x=>x.probe)}));}
 await fs.writeFile(`${dir}/${source.id}.json`,JSON.stringify(row,null,2));
});
await fs.writeFile(`${dir}/discovery.json`,JSON.stringify(report,null,2));
