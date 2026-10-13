export interface NativePort {postMessage(message:string):void;onmessage:(event:MessageEvent)=>void}
export function nativeRpc(port:NativePort){
 let sequence=0;
 const pending=new Map<number,{finish:(error:Error|null,value?:unknown)=>void}>();
 port.onmessage=event=>{try{const response=JSON.parse(event.data);const entry=pending.get(response.id);if(entry)entry.finish(response.error?Error(response.error):null,response.value)}catch{/* Malformed or stale responses cannot resolve another request. */}};
 return function command(name:string,args:Record<string,unknown>={},options:{signal?:AbortSignal;timeoutMs?:number}={}):Promise<any>{
  const signal=options.signal;
  if(signal?.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
   const id=++sequence;
   const abort=()=>finish(signal?.reason||Error('请求已取消'));
   const timer=setTimeout(()=>finish(Error('本机请求超时')),options.timeoutMs??25000);
   const finish=(error:Error|null,value?:unknown)=>{if(!pending.delete(id))return;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)};
   pending.set(id,{finish});signal?.addEventListener('abort',abort,{once:true});
   try{port.postMessage(JSON.stringify({id,command:name,...args}))}catch(error){finish(error instanceof Error?error:Error('本机通信失败'))}
  });
 };
}
