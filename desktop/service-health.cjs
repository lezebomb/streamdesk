const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
async function expectedStatus(data){
 const sources=JSON.parse(await fs.readFile(path.join(data,'sources.json'),'utf8'));if(!Array.isArray(sources))throw Error('来源配置格式无效');
 let cloud={};try{cloud=JSON.parse(await fs.readFile(path.join(data,'cloud.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 return {dataId:createHash('sha256').update(path.resolve(data)).digest('hex').slice(0,16),sourceCount:sources.length,cloudConfigured:!!(cloud.url&&cloud.publishableKey)};
}
function matchesStatus(expected,actual){return expected.dataId===actual.dataId&&expected.sourceCount===actual.sourceCount&&expected.cloudConfigured===actual.cloudConfigured}
async function checkService(base,data){const response=await fetch(base+'/api/runtime-status',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('本机服务状态读取失败');const actual=await response.json(),expected=await expectedStatus(data);if(!matchesStatus(expected,actual))throw Error('本机服务与保存的配置不一致');return actual}
async function recordServiceEvent(data,event,version){
 // Counts and event codes only: never passwords, keys, URLs or viewing records.
 try{const file=path.join(data,'runtime-events.jsonl');try{if((await fs.stat(file)).size>128*1024)await fs.writeFile(file,'')}catch(e){if(e.code!=='ENOENT')throw e}await fs.appendFile(file,JSON.stringify({at:new Date().toISOString(),version,event})+'\n')}catch{}
}
module.exports={expectedStatus,matchesStatus,checkService,recordServiceEvent};
