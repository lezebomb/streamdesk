import fs from 'node:fs/promises';
import {launchBrowser} from './browser.mjs';
const browser=await launchBrowser();try{const svg=await fs.readFile('public/icon.svg','utf8');for(const size of [192,512]){const page=await browser.newPage({viewport:{width:size,height:size}});await page.setContent(`<html><body style="margin:0;width:100vw;height:100vh">${svg.replace('viewBox=',`width="${size}" height="${size}" viewBox=`)}</body></html>`);await page.screenshot({path:`public/icon-${size}.png`});await page.close()}}finally{await browser.close()}
