export function boundedFetch(fetcher:typeof fetch,timeoutMs=10000):typeof fetch{
 return (input,init={})=>{const caller=init.signal||(input instanceof Request?input.signal:undefined);return fetcher(input,{...init,signal:caller?AbortSignal.any([caller,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)})};
}
export async function withDeadline<T>(operation:PromiseLike<T>,timeoutMs:number,message:string):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve(operation),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),timeoutMs)})])}finally{clearTimeout(timer)}}
