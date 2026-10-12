export type EnhancementMode='off'|'lite'|'balanced'|'anime'|'auto';
export type EnhancementProfile='off'|'lite'|'balanced'|'anime';
export interface EnhancementInputs {width:number;height:number;displayWidth:number;displayHeight:number;memoryGB?:number;mobile?:boolean;gpuClass?:'discrete'|'integrated'|'mobile'|'unknown';saveData?:boolean;batteryLow?:boolean;softwareGPU?:boolean;hdr?:boolean;overloaded?:boolean;anime?:boolean}
export function enhancementPlan(mode:EnhancementMode,input:EnhancementInputs){
 let profile:EnhancementProfile=mode==='auto'?(input.mobile||input.gpuClass==='unknown'||!input.memoryGB||input.memoryGB<=4?'lite':input.anime?'anime':'balanced'):mode;
 let reason='手动选择';
 if(mode==='off')return {profile:'off' as const,width:0,height:0,reason:'完全关闭'};
 if(input.softwareGPU||input.hdr)return {profile:'off' as const,width:0,height:0,reason:input.hdr?'HDR 保持浏览器原始色彩':'软件 GPU 回退原画'};
 if(input.overloaded)return {profile:'off' as const,width:0,height:0,reason:'处理超出帧预算，回退原画'};
 if(input.batteryLow||input.saveData){profile='lite';reason='节电或省流量，限制为轻量'}
 if(mode==='auto'&&input.height>=input.displayHeight){profile='lite';reason='画面已达到显示尺寸，限制处理'}
 if(!input.width||!input.height)return {profile,width:0,height:0,reason:'等待首个解码帧'};
 // Bound both uploads (in the renderer) and output allocation. No fake native 4K.
 const maxPixels=profile==='lite'?1280*720:1920*1080;
 if(input.width*input.height>maxPixels)return {profile:'off' as const,width:0,height:0,reason:'原生画面超过当前增强预算，保持原画'};
 const scale=Math.min(2,Math.max(1,input.displayWidth/input.width,input.displayHeight/input.height),Math.sqrt(maxPixels/(input.width*input.height)));
 return {profile,width:Math.max(1,Math.round(input.width*scale)),height:Math.max(1,Math.round(input.height*scale)),reason};
}
