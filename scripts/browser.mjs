import { chromium } from '@playwright/test';
export async function launchBrowser(){
 const options={headless:true,args:['--autoplay-policy=no-user-gesture-required'],downloadsPath:'test-results/downloads'};
 if(process.env.BROWSER_PATH)options.executablePath=process.env.BROWSER_PATH;
 else if(process.platform==='win32')options.channel=process.env.BROWSER_CHANNEL||'chrome';
 if(process.env.GPU_HIGH_PERFORMANCE==='1')options.args.push('--force_high_performance_gpu');
 return chromium.launch(options);
}
export const base=process.env.APP_URL||'http://127.0.0.1:4173';
