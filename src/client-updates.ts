interface UpdateState {state:string;version?:string;latest?:string;percent?:number;message?:string}
declare global {interface Window {streamdeskClient?:{platform:string;fullscreen?(active:boolean):Promise<void>;update(action:string):Promise<UpdateState>;onUpdate(callback:(state:UpdateState)=>void):()=>void}}}
export function bindClientUpdates(){
 const client=window.streamdeskClient;if(!client)return;const root=document.querySelector<HTMLElement>('#client-update')!,button=root.querySelector<HTMLButtonElement>('button')!,status=root.querySelector<HTMLElement>('[role=status]')!;root.hidden=false;let current:UpdateState={state:'idle'};
 const show=(s:UpdateState)=>{current=s;button.disabled=['checking','downloading'].includes(s.state);button.textContent=s.state==='available'?'下载更新':s.state==='ready'?(client.platform==='android'?'安装更新':'重启并更新'):'检查更新';status.textContent=s.state==='checking'?'正在检查更新…':s.state==='downloading'?(s.percent===undefined?'正在下载更新…':'正在下载 '+s.percent+'%'):s.message||('版本 '+(s.version||''))};
 client.onUpdate(show);void client.update('state').then(show).catch(()=>{});button.onclick=()=>{if(button.disabled)return;const action=current.state==='available'?'download':current.state==='ready'?'install':'check';button.disabled=true;void client.update(action).then(show).catch(()=>show({state:'unavailable',message:'更新暂时不可用，当前版本可继续使用'}))};
}
