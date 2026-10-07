import test from 'node:test';
import assert from 'node:assert/strict';
import {regulatoryModel} from '../vendor/regulatory-model.mjs';
import {DEFAULT_RULES} from '../vendor/legal-engine.mjs';
import {integratedRows,EXPORT_HEADERS} from '../vendor/regulatory-export.mjs';
test('integrated export includes all products, every usage and separate additive rows with current outcomes',()=>{
 const model=regulatoryModel([{id:'wbr',material_name:'WBR',locations:[{equipment_id:'one'},{equipment_id:'two'}],components:[{name:'MEK',cas:'78-93-3',content:'1~5%'},{name:'Toluene',cas:'108-88-3',content:'0.1~1%'},{name:'Additive',cas:'',content:'90%'}],regulations:{physical_state:'액체',dangerous:[]}}, {id:'unlinked',material_name:'미연결',components:[],regulations:{}}],DEFAULT_RULES);
 const rows=integratedRows(model,{location:l=>({factory_name:'2공장',equipment_name:l?.equipment_id||''}),pdfUrl:()=> 'https://example.com/MSDS.pdf'});
 assert.equal(rows.length,7);assert(rows.every(r=>r.length===EXPORT_HEADERS.length));
 const wbr=rows.filter(r=>r[4]==='WBR');assert.equal(wbr.length,6);assert.equal(wbr.filter(r=>r[6]==='Additive').length,2);
 assert(wbr.filter(r=>r[6]!=='Additive').every(r=>r[21]==='○'));assert.equal(wbr.find(r=>r[6]==='Toluene')[10],0.01);
 assert.equal(rows.find(r=>r[4]==='미연결')[32],'확인 필요');
});
