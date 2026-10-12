import fs from 'node:fs/promises';
const out=[];
for(const url of ['https://download.blender.org/durian/trailer/','https://download.blender.org/demo/movies/','https://cdn.bitmovin.com/content/assets/sintel/hls/playlist.m3u8']){
 const start=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(12000)});const text=await r.text();out.push({url,status:r.status,ms:performance.now()-start,text});console.log({url,status:r.status,text:text.slice(0,3200)})}catch(e){out.push({url,error:e.message});console.log(url,e.message)}
}await fs.writeFile('research/sample-discovery.json',JSON.stringify(out,null,2));
