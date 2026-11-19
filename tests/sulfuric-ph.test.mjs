import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePh} from '../vendor/msds-parser.mjs';
import {assess,DEFAULT_RULES} from '../vendor/legal-engine.mjs';
import {regulatoryModel,classificationGroups} from '../vendor/regulatory-model.mjs';
const acid={cas:'7664-93-9',name:'황산(SULFURIC ACID)',content:'95%',regulation_selections:{'특별관리물질':true}};
test('uploaded sulfuric PDF physical-properties notation survives assessment and classification',()=>{
 const ph=parsePh('9. 물리화학적 특성\n외관 무색\npH                                     〈1\n녹는점 -22℃ (95%)\n10. 안정성 및 반응성');
 assert.equal(ph,'<1');
 const result=assess([acid],DEFAULT_RULES,{ph});
 assert(result.regulations.osh.includes('특별관리물질'));
 assert(!result.review);
 const doc=JSON.parse(JSON.stringify({id:'sulfuric-new',material_name:'황산',components:[acid],regulations:{ph,osh:result.regulations.osh,physical_state:'액체'}}));
 const group=classificationGroups(regulatoryModel([doc],DEFAULT_RULES)).find(x=>x.title==='특별관리물질');
 assert.equal(group.products.length,1);
 assert.equal(group.products[0].doc.id,'sulfuric-new');
});
test('pH condition uses upper bounds and does not fabricate a missing condition from a checkbox',()=>{
 for(const ph of [1,'<1',2,'1~2']) assert(assess([acid],DEFAULT_RULES,{ph}).regulations.osh.includes('특별관리물질'));
 for(const ph of [3,'>2','3~4']){
  const r=assess([acid],DEFAULT_RULES,{ph});
  assert(!r.regulations.osh.includes('특별관리물질'));assert(!r.review);
 }
 for(const ph of [null,'','1~3','자료없음']){
  const r=assess([acid],DEFAULT_RULES,{ph});assert(!r.regulations.osh.includes('특별관리물질'));assert(r.review);
 }
 assert.equal(parsePh('15. 법적규제\n황산(pH 2.0 이하)'),null);
 assert.equal(parsePh('9. 물리화학적 특성\npH 자료없음\n10. 안정성'),null);
});
