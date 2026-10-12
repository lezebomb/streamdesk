import fs from 'node:fs/promises';
import {launchBrowser,base} from './browser.mjs';
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'}),page=await context.newPage();
const evidence={at:new Date().toISOString(),browser:browser.version(),docs:null,embed:null,requests:[],messages:[],errors:[]};
page.on('response',r=>{if(/framextv/.test(r.url()))evidence.requests.push({url:r.url(),status:r.status()})});page.on('pageerror',e=>evidence.errors.push(e.message));
try{
 await page.goto('https://framextv.xyz/docs',{waitUntil:'domcontentloaded',timeout:20000});await page.locator('body').waitFor();await page.waitForTimeout(2500);
 const text=await page.locator('body').innerText();await fs.writeFile('research/framextv-docs.txt',text);
 evidence.docs={url:page.url(),text};await page.screenshot({path:'reports/framextv-docs.png',fullPage:true});
 // Use the literal provider's documentation example. Only ordinary iframe integration, no media extraction.
 const iframeSrc=text.match(/https:\/\/framextv\.(?:tech|xyz)\/embed\/550[^\s"<]*/)?.[0]||'https://framextv.tech/embed/550?autoplay=1&muted=0';
 if(iframeSrc){
  await page.goto(base);await page.evaluate(src=>{document.body.innerHTML='<h1>FrameXTV documented embed validation</h1>';window.__embedMessages=[];window.addEventListener('message',e=>{window.__embedMessages.push({origin:e.origin,data:e.data})});const frame=document.createElement('iframe');frame.src=src;frame.width='1100';frame.height='620';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');frame.setAttribute('allow','autoplay; fullscreen; picture-in-picture');document.body.append(frame)},iframeSrc);
  await page.waitForTimeout(12000);evidence.messages=await page.evaluate(()=>window.__embedMessages);evidence.embed={url:iframeSrc,iframeExists:await page.locator('iframe').count(),videoPlaybackVerified:false,reason:'Cross-origin iframe has no verified first-frame/telemetry contract in this test; HTTP/iframe load is insufficient'};
  // Inspect visible page text through the browser for an error outcome; do not access or replay private stream APIs.
  const child=page.frames().find(f=>f.url().startsWith(iframeSrc.split('?')[0]));if(child)evidence.embed.visibleText=await child.locator('body').innerText({timeout:4000}).catch(()=>null);
  await page.screenshot({path:'reports/framextv-embed.png',fullPage:true});
 }
}catch(e){evidence.error=e.message}finally{await fs.writeFile('research/framextv-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({docsChars:evidence.docs?.text.length,embed:evidence.embed,messages:evidence.messages.length,error:evidence.error}));await browser.close()}
