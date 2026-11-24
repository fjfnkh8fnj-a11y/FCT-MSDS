import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeComponents,excludedComponent,requiredFields} from '../vendor/material-values.mjs';
import {assess,DEFAULT_RULES,confirmValues,effectiveDocument} from '../vendor/legal-engine.mjs';
import {regulatoryModel} from '../vendor/regulatory-model.mjs';
test('Korean English and bilingual generic additives preserve original names and quantities through save and reload',()=>{
 for(const name of ['첨가제','첨가 제','Additive','ADDITIVE','Additives','첨가제 (ADDITIVE)','ADDITIVE(첨가제)','첨가제（Additive）','Filler Other']){
  for(const cas of ['', '-', '자료없음']){
   const components=normalizeComponents([{name:'수산화 테트라메틸 암모늄',cas:'75-59-2',content:'1.0~2.0'},{name,cas,content:'1.0~10.0'}]);
   assert.equal(components[1].name,name);assert.equal(components[1].content,'1.0~10.0');assert.equal(components[1].cas,'-');assert(excludedComponent(components[1]));
   const doc=effectiveDocument(JSON.parse(JSON.stringify(confirmValues({id:'TPS',material_name:'TPS-300',components,regulations:{physical_state:'액체'}}))));
   assert.deepEqual(requiredFields(doc),[]);
   const result=assess(doc.components,DEFAULT_RULES);
   assert(!result.review);assert(result.regulations.chemical.includes('인체급성유해성물질'));
   assert.equal(regulatoryModel([doc],DEFAULT_RULES).counts.review.products,0);
  }
 }
});
test('a specific CAS is still assessed and an invalid numeric CAS remains actionable',()=>{
 for(const name of ['첨가제','Additive','Filler Other']){
  const [specific]=normalizeComponents([{name,cas:'67-56-1',content:'3%'}]);
  assert(!excludedComponent(specific));assert(assess([specific],DEFAULT_RULES).regulations.osh.includes('관리대상 유해물질'));
  const [invalid]=normalizeComponents([{name,cas:'67-56-2',content:'3%'}]);
  assert(!excludedComponent(invalid));assert(requiredFields({material_name:'x',components:[invalid],regulations:{physical_state:'액체'}}).includes('1행 CAS No.'));
 }
 assert(!excludedComponent({name:'첨가제 A 성분',cas:'',content:'5%'}));
});
