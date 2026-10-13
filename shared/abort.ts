export function combineSignals(signals:AbortSignal[]):AbortSignal {
 const controller=new AbortController();let listeners:(()=>void)[]=[];
 const cleanup=()=>{for(const remove of listeners)remove();listeners=[]};
 for(const signal of signals){if(signal.aborted){controller.abort(signal.reason);cleanup();break}const abort=()=>{controller.abort(signal.reason);cleanup()};signal.addEventListener('abort',abort,{once:true});listeners.push(()=>signal.removeEventListener('abort',abort))}
 return controller.signal;
}
// Older system WebViews support video/MSE but lack the newer abort composition API.
export function installAbortCompatibility(){
 if(typeof AbortSignal.any!=='function')Object.defineProperty(AbortSignal,'any',{configurable:true,value:combineSignals});
 if(typeof AbortSignal.timeout!=='function')Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:(ms:number)=>{const c=new AbortController();setTimeout(()=>c.abort(new DOMException('请求超时','TimeoutError')),ms);return c.signal}});
}
