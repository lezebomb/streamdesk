import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {store} from './storage';
import {reconcileLibrary,mergeEntries,entriesSnapshot,validEntry,type CloudEntry} from '../shared/cloud-library';
import {boundedFetch,withDeadline} from '../shared/request-timeout';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
export async function bindAccount(changed:()=>void){
 let client:SupabaseClient|null=null,userId='',epoch=0,entries:CloudEntry[]=[],timer:ReturnType<typeof setTimeout>|undefined,busy=false,dirty=false,lastPull=0;
 const status=(s:string)=>{$('#account-status').textContent=s;$('#auth-status').textContent=s};
 const submit=$<HTMLButtonElement>('#auth-submit');submit.disabled=true;$('#auth-form').onsubmit=e=>{e.preventDefault();status('账号服务尚未准备好，请稍后重试')};status('正在连接账号服务…');
 const persist=()=>{if(userId)try{localStorage.setItem('sd:account:'+userId+':sync',JSON.stringify(entries))}catch{}};
 const sync=async()=>{
  if(!client||!userId)return;if(busy){dirty=true;return}busy=true;dirty=false;const id=userId,run=epoch;
  try{
   status('正在同步…');const data:CloudEntry[]=[];for(let offset=0;offset<2000;offset+=500){const result=await client.from('streamdesk_library').select('kind,item_key,film,episode_key,position,updated_at,deleted').eq('user_id',id).order('kind').order('item_key').range(offset,offset+499);if(result.error)throw result.error;data.push(...(result.data||[]).filter(validEntry));if((result.data||[]).length<500)break;if(run!==epoch)return}
   if(run!==epoch)return;entries=reconcileLibrary(entries,store.export());entries=mergeEntries(entries,(data||[]).filter(validEntry));store.remote(entriesSnapshot(entries));persist();changed();
   // Conditional upserts avoid overwriting a newer update from another device.
   for(let i=0;i<entries.length;i+=100){if(run!==epoch)return;const {error}=await client.rpc('streamdesk_sync_library',{items:entries.slice(i,i+100)});if(error)throw error}
   if(run===epoch){status('收藏与历史已同步');lastPull=Date.now()}
  }catch{if(run===epoch)status('同步暂时不可用，本机记录已保留')}finally{busy=false;if(dirty&&userId){clearTimeout(timer);timer=setTimeout(()=>void sync(),3000)}}
 };
 const session=(id:string,email?:string)=>{
  if(id===userId&&$('#set-password').hidden===!id)return;++epoch;clearTimeout(timer);userId=id;store.account(id);entries=[];if(id)try{entries=JSON.parse(localStorage.getItem('sd:account:'+id+':sync')||'[]').filter(validEntry)}catch{}
  $('#account-name').textContent=email||'登录后同步收藏与历史';$('#account-open').textContent=id?'账号':'登录 / 注册';$('#account-signout').hidden=!id;$('#auth-form').hidden=!!id;$('#set-password').hidden=!id;$('#sync-now').hidden=!id;$('#password-form').hidden=true;status(id?'正在同步…':'未登录 · 记录保存在本机');changed();if(id)void sync();
 };
 $('#account-open').onclick=()=>($<HTMLDialogElement>('#account-dialog')).showModal();$('#account-close').onclick=()=>($<HTMLDialogElement>('#account-dialog')).close();
 $('#set-password').onclick=()=>{$('#password-form').hidden=false};
 $('#password-form').onsubmit=async e=>{e.preventDefault();const input=$<HTMLInputElement>('#new-password'),confirm=$<HTMLInputElement>('#confirm-password');if(input.value!==confirm.value){status('两次密码不一致');return}const button=$<HTMLButtonElement>('#save-password');button.disabled=true;try{const {error}=await client!.auth.updateUser({password:input.value});if(error)throw error;input.value='';confirm.value='';$('#password-form').hidden=true;status('密码已设置，可在其他设备使用邮箱和密码登录')}catch(error){status((error as Error).message)}finally{button.disabled=false}};
 try{const r=await fetch('/api/cloud-config',{signal:AbortSignal.timeout(6000)}),config=await r.json();if(!r.ok||!config.configured){status('账号同步尚未配置 · 本机记录正常保存');$<HTMLButtonElement>('#auth-submit').disabled=true;return}
  if(new URLSearchParams(location.hash.slice(1)).has('error')){history.replaceState(null,'',location.pathname+location.search);status('确认链接已使用或过期，请用邮箱和密码登录')}
  client=createClient(config.url,config.publishableKey,{global:{fetch:boundedFetch(window.fetch.bind(window))},auth:{storageKey:'sd:auth:'+new URL(config.url).hostname,persistSession:true,autoRefreshToken:true,detectSessionInUrl:!window.streamdeskClient}});
  const {data,error}=await withDeadline(client.auth.getSession(),12000,'账号会话恢复超时');if(error)throw error;session(data.session?.user.id||'',data.session?.user.email);
  client.auth.onAuthStateChange((event,current)=>{setTimeout(()=>{session(current?.user.id||'',current?.user.email);if(event==='PASSWORD_RECOVERY'){$<HTMLDialogElement>('#account-dialog').showModal();$('#password-form').hidden=false}},0)});
 }catch{status('账号服务连接失败，请重新打开应用重试 · 本机记录正常保存');return}
 submit.disabled=false;
 store.subscribe(()=>{if(!userId)return;const next=reconcileLibrary(entries,store.export());if(JSON.stringify(next)===JSON.stringify(entries))return;entries=next;persist();clearTimeout(timer);timer=setTimeout(()=>void sync(),3000)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&userId&&Date.now()-lastPull>30000)void sync()});window.addEventListener('online',()=>void sync());
 $('#sync-now').onclick=()=>void sync();$('#account-signout').onclick=async()=>{const {error}=await client!.auth.signOut({scope:'local'});if(error){status('退出失败，请稍后重试');return}session('');$<HTMLDialogElement>('#account-dialog').close()};
 $('#forgot-password').onclick=async()=>{const email=$<HTMLInputElement>('#account-email').value.trim();if(!email){status('请先填写邮箱');return}const {error}=await client!.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});status(error?error.message:'请查收密码重设邮件，点击链接后在本机设置密码')};
 const tabs=[...document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]')];let mode='login';for(const tab of tabs)tab.onclick=()=>{mode=tab.dataset.authMode!;for(const b of tabs){b.classList.toggle('active',b===tab);b.setAttribute('aria-pressed',String(b===tab))}$<HTMLInputElement>('#account-password').autocomplete=mode==='register'?'new-password':'current-password';$<HTMLInputElement>('#account-password').minLength=mode==='register'?12:1;$('#auth-submit').textContent=mode==='register'?'注册':'登录'};
 $('#auth-form').onsubmit=async e=>{e.preventDefault();const email=$<HTMLInputElement>('#account-email').value.trim(),password=$<HTMLInputElement>('#account-password').value,button=$<HTMLButtonElement>('#auth-submit');button.disabled=true;status(mode==='register'?'正在注册…':'正在登录…');try{
   const result=await withDeadline(mode==='register'?client!.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/'}}):client!.auth.signInWithPassword({email,password}),15000,'登录请求超时，请检查网络后重试');if(result.error)throw result.error;
   $<HTMLInputElement>('#account-password').value='';if(result.data.session){session(result.data.session.user.id,result.data.session.user.email);$<HTMLDialogElement>('#account-dialog').close()}else status('请查收确认邮件，确认邮箱后再登录')
  }catch(error){const message=String((error as Error).message);status(/Invalid login credentials/.test(message)?'邮箱或密码不正确':/Email not confirmed/.test(message)?'请先确认邮箱':/rate limit/i.test(message)?'邮件发送次数受限，请稍后重试':/email.*not.*allowed/i.test(message)?'当前项目尚未配置邮件服务，请联系项目所有者':/timeout|timed\s*out|aborted|failed to fetch|fetch failed|networkerror/i.test(message)?'账号连接失败或超时，请检查网络后重试':message)}finally{button.disabled=false}}
}
