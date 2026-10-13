import fs from 'node:fs/promises';
export async function cloudConfig(){
 let raw={};try{raw=JSON.parse(await fs.readFile('data/cloud.json','utf8'))}catch{}
 const url=process.env.SUPABASE_URL||raw.url,key=process.env.SUPABASE_PUBLISHABLE_KEY||raw.publishableKey;
 if(!url||!key)return {configured:false};
 const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.username||u.password)throw Error('Supabase 配置地址无效');
 let allowed=key.startsWith('sb_publishable_');if(key.startsWith('eyJ'))try{allowed=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon'}catch{}
 if(!allowed)throw Error('客户端只接受 Supabase publishable / anon key');
 return {configured:true,url:u.origin,publishableKey:key};
}
