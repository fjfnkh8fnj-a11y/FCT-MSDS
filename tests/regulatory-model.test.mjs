import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,DEFAULT_RULES,confirmValues,effectiveDocument} from '../vendor/legal-engine.mjs';
import {regulatoryModel,classificationGroups} from '../vendor/regulatory-model.mjs';
const methanol={name:'메탄올',cas:'67-56-1',content:'<3%'};
const doc=(id,components,dangerous=[])=>({id,material_name:id,components,regulations:{physical_state:'액체',dangerous}});
test('possible boundary exceedance is applicable without a review flag',()=>{
 for(const content of ['<3%','0.1~1%','<=1%']){
  const result=assess([{...methanol,content}],DEFAULT_RULES);
  assert(result.regulations.osh.includes('관리대상 유해물질'));assert.equal(result.review,false);
 }
 assert(!assess([{...methanol,content:'<1%'}],DEFAULT_RULES).regulations.osh.includes('관리대상 유해물질'));
});
test('criterion choices are independently validated and cannot fabricate legal applicability',()=>{
 const component={...methanol,regulation_selections:{'관리대상 유해물질':false,'인체급성유해성물질':true}};
 const result=assess([component],DEFAULT_RULES);
 assert(result.regulations.osh.includes('관리대상 유해물질'));assert(!result.regulations.chemical.includes('인체급성유해성물질'));
 assert.equal(result.validations.length,2);assert.equal(result.review,false);
 const revised=assess([{...component,content:'0.2%',regulation_selections:{'관리대상 유해물질':false}}],DEFAULT_RULES);
 assert.deepEqual(revised.validations,[]);assert.deepEqual(revised.regulations.osh,[]);
});
test('selections and multiple additions survive confirmation and reload without erasing other criteria',()=>{
 const component={...methanol,regulation_selections:{'관리대상 유해물질':false,'생태유해성물질':true,'특별관리물질':true}};
 const loaded=effectiveDocument(JSON.parse(JSON.stringify(confirmValues(doc('HD-4110',[component])))));
 assert.deepEqual(loaded.components[0].regulation_selections,component.regulation_selections);
 const result=assess(loaded.components,DEFAULT_RULES);
 assert.equal(result.validations.length,3);assert.equal(result.review,true);
 assert(result.decisions.some(d=>d.label==='사고대비물질'));
});
test('WBR remains managed via MEK and shared changes propagate across product and substance views',()=>{
 const wbr=doc('WBR-2050',[{name:'부탄온',cas:'78-93-3',content:'1~5%'},{name:'톨루엔',cas:'108-88-3',content:'0.1~1%'}]);
 const model=regulatoryModel([wbr,doc('톨루엔',[{name:'톨루엔',cas:'108-88-3',content:'100%'}])],DEFAULT_RULES);
 assert.equal(model.products[0].status,'applicable');assert.equal(model.products[0].review,false);
 assert.equal(model.ingredients.find(r=>r.cas==='108-88-3').products.length,2);
 wbr.components[1].content='<0.3%';
 const changed=regulatoryModel([wbr],DEFAULT_RULES);
 assert(changed.products[0].groups.osh.includes('관리대상 유해물질'));
 assert.equal(changed.ingredients.find(r=>r.cas==='108-88-3').status,'not-applicable');
});
test('dangerous classification and quantity are retained independently from component corrections',()=>{
 const d=doc('HD-4110',[methanol],['제4류 제3석유류(비수용성액체), 지정수량 2,000L']);
 d.components[0]={...methanol,content:'0.2%'};
 const model=regulatoryModel([d],DEFAULT_RULES);
 assert.equal(model.products[0].groups.dangerous[0],d.regulations.dangerous[0]);
 assert.equal(model.products[0].components[0].component.content,'0.2%');
});
test('CAS-less Additive and confidential rows are not merged across products',()=>{
 const rows=[doc('A',[{name:'Additive',cas:'',content:'1~5%'}]),doc('B',[{name:'Additive',cas:'',content:'1~5%'}])];
 const result=regulatoryModel(rows,DEFAULT_RULES);
 assert.equal(result.ingredients.length,2);assert.equal(result.counts.review.products,0);
});

test('classification counts deduplicate products and CAS while retaining separate quantity groups',()=>{
 const rule={id:'q',cas:'67-56-1',group:'chemical',label:'인체급성유해성물질',threshold:1,effective_date:'2020-01-01',regulated_quantities:[{category:'급성',lowest_tons:'0.125',lower_tons:'5',upper_tons:'400'}]};
 const model=regulatoryModel([doc('A',[{...methanol,content:'3%'},{...methanol,content:'3%'}],['제4류 제1석유류(비수용성액체), 지정수량 200L']),doc('B',[{...methanol,content:'3%'}],['제4류 제1석유류(비수용성액체), 지정수량 200L'])],[rule]);
 const groups=classificationGroups(model),chem=groups.find(g=>g.kind==='chemical'),danger=groups.find(g=>g.kind==='dangerous');
 assert.equal(chem.ingredients.length,1);assert.equal(chem.products.length,2);assert(chem.title.includes('최하위 0.125t / 하위 5t / 상위 400t'));assert.equal(danger.products.length,2);
});
