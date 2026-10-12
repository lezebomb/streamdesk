import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=(await fs.readdir('dist/assets')).map(x=>'/assets/'+x),precache=['/','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest',...assets];
let sw=await fs.readFile('public/sw.js','utf8');sw=sw.replace(/const PRECACHE=.*?;/,`const PRECACHE=${JSON.stringify(precache)};`).replace('streamdesk-v2','streamdesk-v2-'+createHash('sha256').update(assets.join(',')).digest('hex').slice(0,12));await fs.writeFile('dist/sw.js',sw);
