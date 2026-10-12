import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enhancementPlan} from '../shared/enhancement-policy.ts';
const input={width:640,height:360,displayWidth:2560,displayHeight:1440,memoryGB:8};
test('enhancement off, software GPU, HDR and overload preserve native video',()=>{
 for(const i of [{softwareGPU:true},{hdr:true},{overloaded:true}])assert.equal(enhancementPlan('balanced',{...input,...i}).profile,'off');assert.equal(enhancementPlan('off',input).width,0);
});
test('low-power automatic and battery profiles bound GPU surfaces',()=>{
 for(const i of [{mobile:true},{memoryGB:2},{batteryLow:true},{saveData:true}]){const p=enhancementPlan('auto',{...input,...i});assert.equal(p.profile,'lite');assert.ok(p.width*p.height<=1280*720)}
 const b=enhancementPlan('balanced',{...input,width:1920,height:1080});assert.ok(b.width*b.height<=1920*1080);
});
