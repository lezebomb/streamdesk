import fs from 'node:fs/promises';
const js=await fs.readFile('research/framextv-app-0.js','utf8');
for(const term of ['API Documentation','API Reference','Embed API','/embed/movie/','/embed/tv/','/embed/anime/','postMessage(','/api/tmdb','path:`/docs`','path:`/api`','iframe src','iframe','Documentation']){
  const items=[]; let at=0;
  for(let i=0;i<6;i++){at=js.indexOf(term,at);if(at<0)break;items.push(js.slice(Math.max(0,at-120),at+550));at+=term.length;}
  console.log(JSON.stringify({term,items}));
}
