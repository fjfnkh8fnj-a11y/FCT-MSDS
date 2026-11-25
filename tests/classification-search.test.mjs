import test from 'node:test';
import assert from 'node:assert/strict';
import {classificationGroups,matchesClassificationSearch,regulatoryModel} from '../vendor/regulatory-model.mjs';
import {DEFAULT_RULES} from '../vendor/legal-engine.mjs';
const docs=[
 {id:'acid',material_name:'황산',components:[{name:'황산',cas:'7664-93-9',content:'95%'}],regulations:{ph:'<1',physical_state:'액체'}},
 {id:'dbp',material_name:'DBP',components:[{name:'디부틸 프탈레이트',cas:'84-74-2',content:'99%'}],regulations:{physical_state:'액체'}},
 {id:'methanol',material_name:'메탄올',components:[{name:'메탄올',cas:'67-56-1',content:'3%'}],regulations:{physical_state:'액체'}}
];
const groups=classificationGroups(regulatoryModel(docs,DEFAULT_RULES));
const search=query=>groups.map(g=>({...g,products:g.products.filter(p=>matchesClassificationSearch(g,p,query))})).filter(g=>g.products.length);
test('classification-name search returns matching category and every applicable product',()=>{
 const rows=search('특별 관리 물질');assert.equal(rows.length,1);assert.equal(rows[0].title,'특별관리물질');assert.deepEqual(rows[0].products.map(p=>p.doc.id).sort(),['acid','dbp']);
 assert(search('관리대상 유해물질').some(g=>g.products.some(p=>p.doc.id==='methanol')));
});
test('classification search still finds product names and CAS while empty search preserves all categories',()=>{
 const rows=search('7664-93-9');assert(rows.length);assert(rows.every(g=>g.products.every(p=>p.doc.id==='acid')));
 assert(search('dbp').every(g=>g.products.every(p=>p.doc.id==='dbp')));
 assert.equal(search('').length,groups.length);assert.equal(search('없는 물질').length,0);
});
