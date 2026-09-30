import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeComponents,requiredFields,confirmValues,effectiveDocument,assess,contentRange,compare,DEFAULT_RULES} from '../vendor/legal-engine.mjs';
test('separate secret rows survive normalization and all regulation engines exclude them',()=>{
 const rows=normalizeComponents([{name:'secret A',cas:'Trade Secret',content:'3~11'}, {name:'secret B',cas:'proprietary',content:'1~2'}, {name:'methanol',cas:'67-56-1',content:'90'}]);
 assert.equal(rows.length,3); assert.deepEqual(rows.slice(0,2).map(c=>c.cas),['-','-']);
 const outcome=assess(rows,DEFAULT_RULES);
 assert(outcome.decisions.length>0); assert(outcome.decisions.every(d=>d.cas==='67-56-1'));
 assert.equal(assess([{name:'proprietary',cas:'67-56-1',content:'100'}],DEFAULT_RULES).decisions.length,0);
});
test('confirmed fields survive load and new extraction without mutating the snapshot',()=>{
 const original={material_name:'verified',components:[{name:'water',cas:'7732-18-5',content:'100'}],regulations:{physical_state:'액체'}};
 const approved=confirmValues(original);
 const reread=effectiveDocument({...approved,material_name:'bad extraction',components:[],regulations:{...approved.regulations,physical_state:'고체'}});
 assert.equal(reread.material_name,'verified'); assert.equal(reread.components[0].cas,'7732-18-5'); assert.equal(reread.regulations.physical_state,'액체');
 assert.deepEqual(requiredFields(reread),[]);
});
test('unknown CAS rules are not missing data; missing CAS remains actionable',()=>{
 const d={material_name:'water',components:[{name:'water',cas:'7732-18-5',content:'100'}],regulations:{physical_state:'액체'}};
 assert.deepEqual(requiredFields(d),[]);
 assert(requiredFields({...d,components:[{name:'Additive',content:'1~5%'}]}).includes('1행 CAS No.'));
 assert.deepEqual(requiredFields({...d,components:normalizeComponents([{name:'영업비밀'}])}),[]);
});
test('inclusive and exclusive concentration boundaries and Korean suffixes',()=>{
 assert.equal(compare(contentRange('<=1%'),1),'review');
 assert.equal(compare(contentRange('<1%'),1),'not-applicable');
 assert.equal(compare(contentRange('>1%'),1),'applicable');
 assert.equal(contentRange('50% 이상').max,100);
 assert.equal(contentRange('50% 이하').min,0);
});

