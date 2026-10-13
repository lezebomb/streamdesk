// Connect only to this task's existing tab. No browser reset, app install or settings change.
export async function mobileCDP(){
 const tabs=await fetch('http://127.0.0.1:9228/json/list').then(r=>r.json());const tab=tabs.find(t=>['page','webview',undefined].includes(t.type)&&t.url.startsWith('http://localhost:4190/')&&new URL(t.url).pathname==='/');if(!tab)throw Error('Owned test tab absent');
 const socket=new WebSocket(tab.webSocketDebuggerUrl),pending=new Map();let id=0;await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 socket.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.id&&pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(pending.has(n)){pending.delete(n);reject(Error('CDP timeout '+method))}},30000).unref()});
 return {call,evaluate:async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value},close:()=>socket.close(),socket};
}
