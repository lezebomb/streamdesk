import fs from 'node:fs/promises';
import {mobileCDP} from './mobile-cdp.mjs';
const c=await mobileCDP();try{
 await c.call('Network.enable');await c.call('Page.enable');const events=[];
 c.socket.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Network.loadingFailed')events.push({method:r.method,params:r.params})});
 await c.evaluate('location.reload();true');await new Promise(r=>setTimeout(r,2500));
 await c.evaluate(`document.querySelector('#mobile-start').click();true`);
 for(let n=0;n<90;n++){await new Promise(r=>setTimeout(r,5000));const phase=await c.evaluate(`document.querySelector('#mobile-phase').textContent`);if(n%3===0){console.log(phase);const p=await c.call('Page.captureScreenshot',{format:'png'});await fs.writeFile('reports/runs/mobile-mate60-visible/screen-'+n+'.png',Buffer.from(p.data,'base64'));}if(/完成|失败/.test(phase))break}
 await fs.writeFile('reports/runs/mobile-mate60-visible/network-failures.json',JSON.stringify(events,null,2));
}finally{c.close()}