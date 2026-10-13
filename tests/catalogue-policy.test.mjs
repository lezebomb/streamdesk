import {test} from 'node:test';import assert from 'node:assert/strict';import {filterFilms} from '../shared/discovery.ts';import {createAppleCmsAdapter} from '../shared/source-adapter.ts';
const f={id:'1',sourceId:'s',title:'作品',year:'2026',category:'电影',contentKind:'regular',genres:['剧情'],episodes:[]};const filters={category:'推荐',genre:[],language:'全部',year:'全部',sort:'latest'};
test('home excludes sports, AI productions, short-form and Chinese animation but permits Japanese anime',()=>{
 const good={...f,id:'jp',category:'动漫',regions:['日本']},china={...good,id:'cn',regions:['中国大陆']};
 const rows=filterFilms([f,good,china,{...china,category:'电影',genres:['动画']},...['sports','ai','short','commentary','trailer'].map(kind=>({...f,id:kind,contentKind:kind}))],filters,Date.UTC(2026,9,13));assert.deepEqual(rows.map(x=>x.id).sort(),['1','jp']);
});
test('recommendation taxonomy cycles works across categories instead of only movie leaves',async()=>{
 const classes=[{type_id:1,type_pid:0,type_name:'动作片'},{type_id:2,type_pid:0,type_name:'爱情片'},{type_id:3,type_pid:0,type_name:'国产剧'},{type_id:4,type_pid:0,type_name:'大陆综艺'},{type_id:5,type_pid:0,type_name:'日本动漫'},{type_id:6,type_pid:0,type_name:'国产动漫'},{type_id:7,type_pid:0,type_name:'体育赛事'}],selected=[];
 const adapter=createAppleCmsAdapter(async(_,p)=>p.ac==='list'?{list:[],class:classes}:(selected.push(p.t),{list:[],pagecount:2}));const source={id:'s',type:'applecms',enabled:true};
 for(let page=1;page<=4;page++)await adapter.browse(source,'推荐',page,new AbortController().signal);assert.deepEqual(selected,['1','3','4','5']);
});
