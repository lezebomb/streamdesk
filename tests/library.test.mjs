import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseLibrary,librarySnapshot} from '../shared/library.ts';
const film={id:'fixture',sourceId:'fixture',title:'迁移测试',episodes:[]};
test('0.1.0 exports migrate into the portable schema without changing position',()=>{const legacy={favorites:[film],history:[{film,episodeKey:'episode:2',position:987.25,at:1}]},migrated=parseLibrary(legacy);assert.equal(migrated.schema,1);assert.equal(migrated.history[0].position,987.25);assert.deepEqual(migrated.favorites,legacy.favorites)});
test('unknown backup versions and damaged records are rejected before import',()=>{const valid=librarySnapshot([film],[]);assert.throws(()=>parseLibrary({...valid,schema:2}));assert.throws(()=>parseLibrary({...valid,history:[{film,episodeKey:'x',position:-1,at:1}]}));assert.throws(()=>parseLibrary({...valid,favorites:[{title:'damaged'}]}));assert.equal(valid.favorites[0],film)});
