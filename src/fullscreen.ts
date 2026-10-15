export function bindVideoFullscreen(wrapper:HTMLElement,notify:(message:string)=>void){
 const button=document.querySelector<HTMLButtonElement>('#enhance-fullscreen')!,touch=wrapper.querySelector<HTMLButtonElement>('#touch-fullscreen')!,fit=wrapper.querySelector<HTMLButtonElement>('#touch-fit')!;
 const mobile=window.streamdeskClient?.platform==='android'||matchMedia('(hover:none) and (pointer:coarse)').matches;
 const orientation=screen.orientation as ScreenOrientation&{lock?:(value:string)=>Promise<void>};
 let active=false,pending=false,fill=mobile;
 const render=()=>{wrapper.classList.toggle('player-fullscreen',active);wrapper.classList.toggle('fullscreen-fill',active&&fill);button.textContent=active?'退出全屏':'全屏';touch.setAttribute('aria-label',active?'退出全屏':'全屏');touch.innerHTML=`<i class="ph ph-arrows-${active?'in':'out'}" aria-hidden="true"></i>`;fit.hidden=!active||!mobile;fit.textContent=fill?'完整画面':'铺满屏幕';fit.setAttribute('aria-label',fill?'显示完整画面':'等比铺满屏幕');fit.setAttribute('aria-pressed',String(fill));};
 const exited=()=>{active=false;render();try{orientation?.unlock()}catch{}};
 const exit=async()=>{if(window.streamdeskClient?.fullscreen)await window.streamdeskClient.fullscreen(false);else if(document.fullscreenElement===wrapper)await document.exitFullscreen();exited()};
 button.onclick=async()=>{if(pending)return;pending=true;try{if(active){await exit();return}fill=mobile;if(window.streamdeskClient?.fullscreen){await window.streamdeskClient.fullscreen(true);active=true;render()}else{await wrapper.requestFullscreen();active=true;render();if(mobile)try{await orientation?.lock?.('landscape')}catch{notify('浏览器未允许自动横屏，可手动旋转手机')}}}catch{notify('当前环境无法开启全屏，请重试')}finally{pending=false}};
 fit.onclick=()=>{fill=!fill;render()};
 document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===wrapper){active=true;render()}else if(!window.streamdeskClient?.fullscreen)exited()});
 window.addEventListener('streamdesk-fullscreen-exit',exited);
 document.addEventListener('keydown',e=>{if(active&&e.code==='Escape')void exit().catch(()=>notify('退出全屏失败，请重试'))});
 document.querySelector('#close-watch')!.addEventListener('click',()=>{if(active)void exit().catch(()=>{})});render();
}
