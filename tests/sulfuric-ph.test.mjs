import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePh,findSulfuricSpecialEvidence} from '../vendor/msds-parser.mjs';
import {assess,DEFAULT_RULES,confirmValues,effectiveDocument} from '../vendor/legal-engine.mjs';
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
test('explicit section 15 sulfuric decisions resolve missing or boundary pH without inventing pH',()=>{
 const data={pages:[{pageNumber:7,lines:['15. 법적 규제현황','○ 특별관리대상물질','- [1,2-에테인다이올] : 해당없음','- 해당됨 (0.1% 이상 함유한 황산, pH 2.0 이하인 강산은 특별관리물질)','○ 특수건강검진대상물질','- 해당없음','16. 기타 참고사항'].map(text=>({text}))}]};
 const evidence=findSulfuricSpecialEvidence(data);
 assert.equal(evidence.page,7);
 const c={...acid,regulation_evidence:{'특별관리물질':evidence}};
 for(const ph of [null,'산성','1~3']){
  const outcome=assess([c],DEFAULT_RULES,{ph});
  assert(outcome.regulations.osh.includes('특별관리물질'));assert(!outcome.review);
  assert(outcome.decisions.find(d=>d.label==='특별관리물질').source_evidence);
  const restored=JSON.parse(JSON.stringify(confirmValues({id:'source',material_name:'황산 함유 제품',components:[c],regulations:{ph,physical_state:'액체'}})));
  assert(classificationGroups(regulatoryModel([effectiveDocument(restored)],DEFAULT_RULES)).some(g=>g.title==='특별관리물질'));
 }
 assert(!assess([{...c,content:'0.01%'}],DEFAULT_RULES).regulations.osh.includes('특별관리물질'));
 assert(!assess([c],DEFAULT_RULES,{ph:4}).regulations.osh.includes('특별관리물질'));
 const negative={pages:[{pageNumber:7,lines:['15. 법적 규제현황','○ 특별관리대상물질','- 해당없음 (황산)','○ 노출기준설정물질','- 해당됨 (황산)','16. 기타 참고사항'].map(text=>({text}))}]};
 assert.equal(findSulfuricSpecialEvidence(negative),null);
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
