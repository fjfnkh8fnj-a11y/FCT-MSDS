import test from 'node:test';
import assert from 'node:assert/strict';
import {completeDangerous,dangerousReviewReasons,completeDangerousFromMsds} from '../vendor/dangerous-quantity.mjs';
import {findRegulations} from '../vendor/msds-parser.mjs';
import {regulatoryModel,classificationGroups} from '../vendor/regulatory-model.mjs';
const data=text=>({text,pages:[{lines:text.split('\n').map(text=>({text}))}]});
test('Schedule 1 assigns the correct volume by petroleum class and water solubility',()=>{
 for(const [n,non,sol] of [[1,200,400],[2,1000,2000],[3,2000,4000]])for(const [water,q]of [['비수용성',non],['수용성',sol]]){
  const rows=completeDangerous(['제4류 제'+n+'석유류('+water+'액체)']);assert(rows[0].endsWith(q.toLocaleString('en-US')+'L'));assert.deepEqual(completeDangerous(rows),rows);
 }
 assert(completeDangerous(['제4류 알코올류'])[0].endsWith('400L'));assert(completeDangerous(['제4류 제4석유류'])[0].endsWith('6,000L'));
 assert(dangerousReviewReasons(['제4류 제3석유류']).length);
});
test('split legacy fields and multiple classifications keep quantities and units separate',()=>{
 assert.deepEqual(completeDangerous(['제4류 인화성액체','제1석유류(비수용성)','지정수량 200L']),['제4류 제1석유류(비수용성액체), 지정수량 200L']);
 const rows=completeDangerous(['제2류 금속분 / 제4류 제3석유류(비수용성액체)']);assert.equal(rows.length,2);assert(rows[0].includes('500kg'));assert(rows[1].includes('2,000L'));
});
test('PDF scan fills quantity from section 9 and flags contradictory source data',()=>{
 const text='9. 물리 화학적 특성\n사. 인화점 : 230℃\n타. 용해도 : 물에 완전 용해\n10. 안정성 및 반응성\n15. 법적 규제현황\n다. 위험물안전관리법에 의한 규제\n제4류 제3석유류\n라. 폐기물관리법';
 const r=findRegulations(data(text));assert(r.dangerous[0].includes('수용성액체'));assert(r.dangerous[0].includes('4,000L'));assert(r.dangerous_review_reasons.some(s=>s.includes('230℃')));
 const conflict=completeDangerousFromMsds(['제4류 제3석유류(비수용성액체)'],text);assert(conflict.dangerous[0].includes('2,000L'));assert(conflict.dangerous_review_reasons.some(s=>s.includes('수용성')));
});
test('PDF scan retains both listed classifications and grouping includes all designated quantities',()=>{
 const text='15. 법적 규제현황\n위험물안전관리법\n제2류 : 가연성 고체 5. 금속분 (500킬로그램)\n제4류 : 인화성 액체 5. 제3석유류(비수용성액체) (2,000리터)\n폐기물관리법';
 const r=findRegulations(data(text));assert.equal(r.dangerous.length,2);
 const model=regulatoryModel([{id:'paste',material_name:'Paste',components:[],regulations:{dangerous:r.dangerous}}],[]);
 assert.equal(classificationGroups(model).filter(g=>g.kind==='dangerous').length,2);
});
