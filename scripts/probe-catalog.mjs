import fs from 'node:fs/promises';
import {adapters} from '../server/adapters.mjs';
const candidates=JSON.parse(await fs.readFile('data/candidates.json','utf8')),results=[];
for(const source of candidates){for(const query of ['流浪地球','琅琊榜','葬送的芙莉莲']){const start=performance.now();try{const list=await adapters.get('applecms').search(source,query,new AbortController().signal);results.push({source:source.id,api:source.api,query,ok:true,ms:performance.now()-start,list});console.log(JSON.stringify({source:source.id,query,ms:performance.now()-start,count:list.length,items:list.slice(0,3).map(f=>({id:f.id,title:f.title,category:f.category,year:f.year}))}))}catch(e){results.push({source:source.id,api:source.api,query,ok:false,ms:performance.now()-start,error:e.message});console.log(results.at(-1));break}}}
await fs.writeFile('reports/provider-api.json',JSON.stringify({at:new Date().toISOString(),concurrency:1,timeoutMs:8000,results},null,2));
