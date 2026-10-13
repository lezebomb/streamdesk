export function createNetworkPool(limit=3){
 const foreground=[],background=[];let active=0,backgroundActive=0;
 function drain(){
  while(active<limit){
   const job=foreground.shift()||(!backgroundActive?background.shift():undefined);if(!job)return;
   job.signal?.removeEventListener('abort',job.abort);active++;if(job.background)backgroundActive++;
   Promise.resolve().then(()=>{job.signal?.throwIfAborted();return job.task()}).then(job.resolve,job.reject).finally(()=>{active--;if(job.background)backgroundActive--;drain()});
  }
 }
 return (task,signal,{background:lowPriority=false}={})=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return}const queue=lowPriority?background:foreground;
  const job={task,signal,resolve,reject,background:lowPriority,abort:()=>{const n=queue.indexOf(job);if(n>=0){queue.splice(n,1);reject(signal.reason)}}};
  signal?.addEventListener('abort',job.abort,{once:true});queue.push(job);drain();
 });
}
// Metadata uses at most one slot. Foreground searches retain two slots and queue priority.
export const networkSlot=createNetworkPool();
