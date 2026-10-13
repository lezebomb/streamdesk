import type {Film,Episode} from '../shared/model';
interface Selection {film:Film|null;episode:Episode|null;position:number}
export function bindCasting(selected:()=>Selection,pause:()=>void,toast:(s:string)=>void){
 const dialog=document.querySelector<HTMLDialogElement>('#cast-dialog')!,status=document.querySelector<HTMLElement>('#cast-status')!,list=document.querySelector<HTMLElement>('#cast-devices')!,controls=document.querySelector<HTMLElement>('#cast-controls')!;let deviceId='',sessionSelection:Selection|null=null;
 const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 async function request(path:string,body?:unknown){const r=await fetch('/api/cast/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error||'投屏请求失败');return d}
 document.querySelector<HTMLElement>('#cast')!.onclick=()=>{sessionSelection=selected();dialog.showModal();status.textContent='请选择电视；浏览器原生投屏是否可用由浏览器和电视决定。'};
 document.querySelector<HTMLElement>('#cast-close')!.onclick=()=>dialog.close();
 document.querySelector<HTMLElement>('#cast-scan')!.onclick=async()=>{status.textContent='正在查找电视…';try{const d=await request('devices');list.innerHTML=d.devices.map((x:{id:string;name:string})=>`<button class="cast-device" data-device="${esc(x.id)}">${esc(x.name)}</button>`).join('');status.textContent=d.devices.length?'选择电视开始播放':'没有发现 DLNA 电视。请检查同一网络和电视投屏接收设置。'}catch(e){status.textContent=String(e)}};
 list.onclick=async e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-device]');if(!button||!sessionSelection?.film||!sessionSelection.episode)return;button.setAttribute('disabled','');const selection=sessionSelection;try{status.textContent='正在连接…';await request('play',{deviceId:button.dataset.device,source:selection.film!.sourceId,id:selection.film!.id,episodeKey:selection.episode!.key,groupId:selection.episode!.groupId,position:selection.position});deviceId=button.dataset.device!;controls.hidden=false;pause();status.textContent='电视已接受播放命令。若没有画面，可能是电视不支持此线路格式。'}catch(e){status.textContent=String(e)}finally{button.removeAttribute('disabled')}};
 controls.onclick=async e=>{const action=(e.target as HTMLElement).closest<HTMLElement>('[data-cast-action]')?.dataset.castAction;if(!action||!deviceId)return;try{await request('control',{deviceId,action});status.textContent=action==='Stop'?'投屏已结束':action==='Pause'?'电视已接受暂停命令':'电视已接受继续播放命令';if(action==='Stop')controls.hidden=true}catch(e){status.textContent=String(e)}};
 document.querySelector<HTMLElement>('#cast-native')!.onclick=()=>{const e=sessionSelection?.episode;if(!e||e.kind==='embed'||e.url.includes('/offline/')){toast('当前线路无法交给浏览器投屏');return}
  // MSE uses a blob URL which receivers cannot retrieve. Use the original media URL
  // on an independent element so a cancelled prompt never resets local hls.js.
  const remoteVideo=document.createElement('video');remoteVideo.src=e.url;remoteVideo.preload='none';const remote=(remoteVideo as HTMLVideoElement&{remote?:{prompt:()=>Promise<void>;state:string;addEventListener:(s:string,f:()=>void)=>void}}).remote;
  if(!remote){status.textContent='当前浏览器没有提供原生投屏能力，请使用 DLNA 或手机系统无线投屏';return}
  remote.addEventListener('connect',()=>{pause();status.textContent='浏览器已连接电视'});
  void remote.prompt().catch(err=>{status.textContent=err.name==='NotFoundError'?'没有发现浏览器支持的接收设备':err.name==='NotAllowedError'?'投屏选择已取消或未获允许':String(err)});
 };
}
