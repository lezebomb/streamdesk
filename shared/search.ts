import type {SearchRow} from './model';
export type SearchEvent={type:'start';total:number}|{type:'source';row:SearchRow}|{type:'done';ms:number};
// Handles UTF-8 and JSON lines split at arbitrary TCP chunk boundaries.
export async function consumeSearch(response:Response,receive:(event:SearchEvent)=>void) {
 if(!response.ok||!response.body)throw new Error(`搜索 HTTP ${response.status}`);
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',done=false;
 const parse=()=>{let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(line.trim()){const event=JSON.parse(line) as SearchEvent;receive(event);if(event.type==='done')done=true}}};
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});if(pending.length>2*1024*1024)throw new Error('搜索响应过大');parse()}pending+=decoder.decode();if(pending.trim()){pending+='\n';parse()}if(!done)throw new Error('搜索连接提前结束')}finally{reader.releaseLock()}
}
