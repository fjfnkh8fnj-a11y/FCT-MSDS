import test from 'node:test';
import assert from 'node:assert/strict';
import {regulatoryModel} from '../vendor/regulatory-model.mjs';
import {DEFAULT_RULES} from '../vendor/legal-engine.mjs';
import {integratedRows,integratedWorkbook,EXPORT_HEADERS} from '../vendor/regulatory-export.mjs';
import fs from 'node:fs/promises';
import JSZip from '../vendor/jszip.min.js';
test('integrated export includes all products, every usage and separate additive rows with current outcomes',()=>{
 const model=regulatoryModel([{id:'wbr',material_name:'WBR',locations:[{equipment_id:'one'},{equipment_id:'two'}],components:[{name:'MEK',cas:'78-93-3',content:'1~5%'},{name:'Toluene',cas:'108-88-3',content:'0.1~1%'},{name:'Additive',cas:'',content:'90%'}],regulations:{physical_state:'액체',dangerous:[]}}, {id:'unlinked',material_name:'미연결',components:[],regulations:{}}],DEFAULT_RULES);
 const rows=integratedRows(model,{location:l=>({factory_name:'2공장',equipment_name:l?.equipment_id||''}),pdfUrl:()=> 'https://example.com/MSDS.pdf'});
 assert.equal(rows.length,7);assert(rows.every(r=>r.length===EXPORT_HEADERS.length));
 const wbr=rows.filter(r=>r[4]==='WBR');assert.equal(wbr.length,6);assert.equal(wbr.filter(r=>r[6]==='Additive').length,2);
 assert(wbr.filter(r=>r[6]!=='Additive').every(r=>r[21]==='○'));assert.equal(wbr.find(r=>r[6]==='Toluene')[10],0.01);
 assert.equal(rows.find(r=>r[4]==='미연결')[32],'확인 필요');
});
test('native template produces data rows, frozen panes, filters and PDF hyperlinks',async()=>{
 const template=await fs.readFile(new URL('../vendor/regulatory-export-template_rev.21.xlsx',import.meta.url));
 const row=EXPORT_HEADERS.map(()=> '');row[0]=1;row[4]='=제품 & <원문>';row[9]=0.01;row[15]='○';row[38]='https://example.com/msds.pdf?a=1&b=2';
 const blob=await integratedWorkbook(JSZip,template,[row]);
 const zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
 assert(xml.includes('제품 &amp; &lt;원문&gt;'));assert(xml.includes('<v>0.01</v>'));assert(!xml.includes('<f>'));
 assert(xml.includes('topLeftCell="F5"'));assert(xml.includes('autoFilter ref="A4:AN5"'));assert(xml.includes('hyperlink ref="AM5"'));assert(zip.file('xl/worksheets/_rels/sheet1.xml.rels'));
});
