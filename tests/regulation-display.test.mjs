import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,DEFAULT_RULES} from '../vendor/legal-engine.mjs';
import {productAssessments} from '../vendor/regulation-display.mjs';
import {cleanComponentName} from '../vendor/msds-parser.mjs';
test('boundary-crossing WBR is applicable while below-threshold RY stays non-applicable',()=>{
 const rows=[['TOLUENE 99.5%','100%'],['FERRO BINDER','>=60-<65'],['WBR-2050','0.1-1%'],['RY-5125','<0.3%']].map(([name,content])=>{
  const component={name:'Toluene',cas:'108-88-3',content}; const decisions=assess([component],DEFAULT_RULES).decisions;
  const status=decisions.some(d=>d.status==='review')?'review':decisions.some(d=>d.status==='applicable')?'applicable':'not-applicable';
  return {doc:{id:name,material_name:name},component,decisions,status,basis:name+'의 근거'};
 });
 const products=productAssessments(rows);
 assert.deepEqual(products.filter(p=>p.status==='review'),[]);
 assert.equal(products.find(p=>p.doc.id==='WBR-2050').status,'applicable');
 assert.equal(products.find(p=>p.doc.id==='RY-5125').status,'not-applicable');
 assert.equal(products.find(p=>p.doc.id==='FERRO BINDER').contents[0],'>=60-<65');
});
test('original ingredient name takes priority and CAS fills only a missing name',()=>{
 assert.equal(cleanComponentName('Toluene','108-88-3'),'Toluene');
 assert.equal(cleanComponentName('원문에 기재된 명칭','108-88-3'),'원문에 기재된 명칭');
 assert.equal(cleanComponentName('','108-88-3'),'톨루엔 (Toluene)');
 assert.equal(cleanComponentName('-','108-88-3'),'톨루엔 (Toluene)');
 assert.equal(cleanComponentName('','영업비밀'),'');
});
