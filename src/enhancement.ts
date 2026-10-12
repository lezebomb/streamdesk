import {enhancementPlan,type EnhancementMode,type EnhancementProfile} from '../shared/enhancement-policy';
// Original single-pass SDR filter. This is spatial processing, not neural SR or native 4K.
const vertex=`#version 300 es
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 sourceSize;
uniform float strength;
uniform float denoise;
uniform float cubic;
in vec2 uv;
out vec4 color;
vec3 sampleAt(vec2 p){return texture(image,clamp(p,vec2(0.0),vec2(1.0))).rgb;}
// Four bilinear fetches implement a cubic B-spline reconstruction, followed by
// edge-limited unsharp compensation. Smooth scaling avoids ringing/negative lobes.
vec3 scaled(vec2 p){
 if(cubic<0.5)return sampleAt(p);
 vec2 q=p*sourceSize-0.5,f=fract(q),b=floor(q);
 vec2 w0=pow(1.0-f,vec2(3.0))/6.0,w1=(3.0*f*f*f-6.0*f*f+4.0)/6.0;
 vec2 w2=(-3.0*f*f*f+3.0*f*f+3.0*f+1.0)/6.0,w3=f*f*f/6.0;
 vec2 g0=w0+w1,g1=w2+w3,a=(b-1.0+w1/g0+0.5)/sourceSize,c=(b+1.0+w3/g1+0.5)/sourceSize;
 return g0.y*(g0.x*sampleAt(a)+g1.x*sampleAt(vec2(c.x,a.y)))+g1.y*(g0.x*sampleAt(vec2(a.x,c.y))+g1.x*sampleAt(c));
}
float luma(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}
void main(){
 vec2 d=1.0/sourceSize;vec3 center=sampleAt(uv),n=sampleAt(uv+vec2(0.0,d.y)),s=sampleAt(uv-vec2(0.0,d.y)),e=sampleAt(uv+vec2(d.x,0.0)),w=sampleAt(uv-vec2(d.x,0.0));
 float y=luma(center);vec4 delta=abs(vec4(luma(n),luma(s),luma(e),luma(w))-y);
 vec4 weights=exp(-delta*delta/0.0018);
 vec3 filtered=(center*2.0+n*weights.x+s*weights.y+e*weights.z+w*weights.w)/(2.0+dot(weights,vec4(1.0)));
 vec3 base=scaled(uv);float edge=max(max(delta.x,delta.y),max(delta.z,delta.w));
 // Mild spatial denoise/deblock only within similar tones; never erase strong edges.
 base+=denoise*(filtered-center)*(1.0-smoothstep(0.03,0.14,edge));
 vec3 detail=center-(n+s+e+w)*0.25;detail=clamp(detail,vec3(-0.035),vec3(0.035));
 color=vec4(clamp(base+detail*strength,0.0,1.0),1.0);
}`;
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
export class VideoEnhancement {
 mode:EnhancementMode='off';private gl:WebGL2RenderingContext|null=null;private canvas:HTMLCanvasElement|null=null;private program:WebGLProgram|null=null;private texture:WebGLTexture|null=null;
 private timer:TimerExtension|null=null;private queries:WebGLQuery[]=[];private disposed=false;private blocked='';private overloaded=false;private badWindows=0;private windowCosts:number[]=[];private lastFrameAt=0;private controlUntil=0;private batteryLow=false;private batteryCleanup:(()=>void)|null=null;
 private visible=true;private firstEnhancedFrameMs:number|null=null;private profile:EnhancementProfile='off';private frames=0;private cpuCosts:number[]=[];private gpuCosts:number[]=[];private renderSize=[0,0];private renderer:string|null=null;private software=false;private reason='完全关闭';private lastCheck=0;private dropAnchor:{frames:number;dropped:number}|null=null;
 constructor(private video:HTMLVideoElement){
  new IntersectionObserver(entries=>{this.visible=entries[0]?.isIntersecting??false;if(!this.visible){this.hide();this.dropAnchor=null;this.badWindows=0;}},{threshold:0.1}).observe(video);
  const controls=()=>{this.controlUntil=performance.now()+1800;if(this.canvas)this.canvas.hidden=true};
  video.addEventListener('pointermove',controls);video.addEventListener('pointerdown',controls);
  for(const event of ['seeking','waiting','emptied','enterpictureinpicture'])video.addEventListener(event,()=>{this.hide();this.dropAnchor=null;this.badWindows=0;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.hide()});
  document.addEventListener('fullscreenchange',()=>this.hide());
 }
 setMode(mode:EnhancementMode){if(!['off','lite','balanced','anime','auto'].includes(mode))return;this.mode=mode;this.overloaded=false;this.blocked='';this.badWindows=0;this.dropAnchor=null;this.lastCheck=0;this.resetMetrics();if(mode==='off'){this.reason='完全关闭';this.release();}else {this.reason='等待首个解码帧';void this.trackBattery()}}
 reset(){this.release();this.overloaded=false;this.blocked='';this.badWindows=0;this.dropAnchor=null;this.lastCheck=0;this.resetMetrics();}
 private resetMetrics(){this.firstEnhancedFrameMs=null;this.frames=0;this.cpuCosts=[];this.gpuCosts=[];this.windowCosts=[];this.lastFrameAt=0;this.renderSize=[0,0];}
 private hide(){if(this.canvas)this.canvas.hidden=true;}
 private async trackBattery(){if(this.batteryCleanup)return;type Battery=EventTarget&{charging:boolean;level:number};const nav=navigator as Navigator&{getBattery?:()=>Promise<Battery>};try{const b=await nav.getBattery?.();if(!b||this.mode==='off')return;const update=()=>{this.batteryLow=!b.charging&&b.level<.25};update();b.addEventListener('chargingchange',update);b.addEventListener('levelchange',update);this.batteryCleanup=()=>{b.removeEventListener('chargingchange',update);b.removeEventListener('levelchange',update)}}catch{/* Unavailable battery data stays unknown. */}}
 private init(){
  const canvas=document.createElement('canvas');canvas.className='enhancement-canvas';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');this.video.parentElement!.append(canvas);this.canvas=canvas;
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});if(!gl)throw new Error('WebGL2 不可用');this.gl=gl;
  const d=gl.getExtension('WEBGL_debug_renderer_info');this.renderer=d?String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)):null;this.software=/swiftshader|llvmpipe|software/i.test(this.renderer||'');if(this.software)throw new Error('软件 GPU 保持原画');
  canvas.addEventListener('webglcontextlost',e=>{if(this.gl!==gl)return;e.preventDefault();this.blocked='GPU 上下文丢失，保持原画';this.release()});
  const shaders:WebGLShader[]=[];try{for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){const shader=gl.createShader(type)!;shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('增强着色器编译失败：'+gl.getShaderInfoLog(shader))}
   const p=gl.createProgram()!;this.program=p;for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('增强着色器链接失败');gl.useProgram(p);
  }finally{for(const s of shaders)gl.deleteShader(s)}
  this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension|null;
 }
 // Called by Player's existing RVFC. Disabled mode has no canvas, GPU context or loop.
 frame(now:number,meta:VideoFrameCallbackMetadata,anime=false,hdr=false,mediaStarted=now,fps=30){
  if(this.mode==='off'||this.disposed)return;
  const v=this.video;if(this.blocked||this.overloaded||!this.visible||document.hidden||v.seeking||v.readyState<3||now<this.controlUntil||document.fullscreenElement===v||document.pictureInPictureElement===v||Array.from(v.textTracks).some(t=>t.mode==='showing')){this.hide();return}
  try{
   const device=navigator as Navigator&{deviceMemory?:number;connection?:{saveData?:boolean}};
   const box=v.getBoundingClientRect(),pixelRatio=Math.min(2,devicePixelRatio||1);
   if(!this.gl)this.init();const gl=this.gl!,canvas=this.canvas!;
   const plan=enhancementPlan(this.mode,{width:v.videoWidth,height:v.videoHeight,displayWidth:box.width*pixelRatio,displayHeight:box.height*pixelRatio,memoryGB:device.deviceMemory,gpuClass:/geforce|rtx|radeon rx/i.test(this.renderer||'')?'discrete':/intel|iris|uhd|radeon\(tm\) graphics/i.test(this.renderer||'')?'integrated':/maleoon|adreno|mali|powervr/i.test(this.renderer||'')?'mobile':'unknown',mobile:matchMedia('(pointer:coarse)').matches,saveData:device.connection?.saveData,batteryLow:this.batteryLow,softwareGPU:this.software,hdr,anime});this.reason=plan.reason;this.profile=plan.profile;
   if(plan.profile==='off'||!plan.width||v.videoWidth*v.videoHeight>1920*1080){this.reason=plan.profile==='off'?plan.reason:'大于 1080p 保持原画，避免额外上传与色彩损失';this.hide();return}
   // Do not leave a stale processed frame on screen when a high-FPS stream exceeds budget.
   if(this.lastFrameAt&&now-this.lastFrameAt<15){this.hide();return}this.lastFrameAt=now;
   const ratio=v.videoWidth/v.videoHeight,height=Math.min(box.height,box.width/ratio),width=height*ratio;
   canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.style.left=(box.width-width)/2+'px';canvas.style.top=(box.height-height)/2+'px';
   if(canvas.width!==plan.width||canvas.height!==plan.height){canvas.width=plan.width;canvas.height=plan.height;gl.viewport(0,0,plan.width,plan.height);this.renderSize=[plan.width,plan.height]}
   this.pollTimers();const query=this.timer&&this.queries.length<4?gl.createQuery():null;if(query)gl.beginQuery(this.timer!.TIME_ELAPSED_EXT,query);
   const start=performance.now();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,v);
   gl.uniform2f(gl.getUniformLocation(this.program!,'sourceSize'),v.videoWidth,v.videoHeight);gl.uniform1f(gl.getUniformLocation(this.program!,'cubic'),plan.profile==='lite'?0:1);
   gl.uniform1f(gl.getUniformLocation(this.program!,'strength'),plan.profile==='anime'?.48:plan.profile==='lite'?.22:.32);gl.uniform1f(gl.getUniformLocation(this.program!,'denoise'),plan.profile==='anime'?.24:plan.profile==='lite'?.10:.16);
   gl.drawArrays(gl.TRIANGLES,0,3);if(query){gl.endQuery(this.timer!.TIME_ELAPSED_EXT);this.queries.push(query)}
   const ms=performance.now()-start;this.cpuCosts.push(ms);this.windowCosts.push(ms);if(this.cpuCosts.length>300)this.cpuCosts.shift();this.frames++;if(this.firstEnhancedFrameMs===null)this.firstEnhancedFrameMs=performance.now()-mediaStarted;canvas.hidden=false;
   if(now-this.lastCheck>3000){this.lastCheck=now;const q=v.getVideoPlaybackQuality(),previous=this.dropAnchor;this.dropAnchor={frames:q.totalVideoFrames,dropped:q.droppedVideoFrames};const n=previous?q.totalVideoFrames-previous.frames:0,drop=previous&&n>30?(q.droppedVideoFrames-previous.dropped)/n:0;
    const avg=this.windowCosts.reduce((a,b)=>a+b,0)/Math.max(1,this.windowCosts.length),gpu=this.gpuCosts.slice(-60),gpuAvg=gpu.reduce((a,b)=>a+b,0)/Math.max(1,gpu.length),budget=Math.min(8,1000/Math.max(24,Math.min(120,fps))*.25);
    this.badWindows=avg>budget||gpuAvg>budget||drop>.03?this.badWindows+1:0;this.windowCosts=[];
    if(this.badWindows>=2){this.overloaded=true;this.reason='处理或掉帧超出预算，已回退原画';this.release()}
   }
  }catch(e){this.blocked=e instanceof Error?e.message:String(e);this.reason=this.blocked;this.release()}
 }
 private pollTimers(){const gl=this.gl!,ext=this.timer;if(!ext)return;const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);while(this.queries.length&&gl.getQueryParameter(this.queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=this.queries.shift()!;if(!disjoint){this.gpuCosts.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);if(this.gpuCosts.length>300)this.gpuCosts.shift()}gl.deleteQuery(q)}}
 private release(){const gl=this.gl;if(gl){for(const q of this.queries)gl.deleteQuery(q);if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);gl.getExtension('WEBGL_lose_context')?.loseContext()}this.queries=[];this.texture=null;this.program=null;this.gl=null;this.canvas?.remove();this.canvas=null;this.batteryCleanup?.();this.batteryCleanup=null;this.profile='off';}
 snapshot(){const stats=(values:number[])=>values.length?{meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:values.slice().sort((a,b)=>a-b)[Math.floor((values.length-1)*.95)],samples:values.length}:null;return {mode:this.mode,profile:this.profile,active:!!this.canvas&&!this.canvas.hidden,reason:this.blocked||this.reason,renderer:this.renderer,frames:this.frames,firstEnhancedFrameMs:this.firstEnhancedFrameMs,renderSize:this.renderSize,cpuSubmission:stats(this.cpuCosts),gpuPass:stats(this.gpuCosts),gpuUtilization:null,nativeResolution:[this.video.videoWidth,this.video.videoHeight],label:'空间滤镜与缩放；不是原生 4K 或神经网络超分'};}
}
