import {contentRange} from './legal-engine.mjs?v=VER13_rev.23';
export const EXPORT_HEADERS=['번호','공장','부서','설비','제품명','성상','성분명','CAS No.','함량 원문','최소 함량','최대 함량','급성 기준','만성 기준','생태 기준','사고대비 기준','인체급성','인체만성','생태유해성','사고대비','작업환경측정','특수건강진단','관리대상','특별관리','노출기준','허용기준','공정안전보고서','위험물 분류','지정수량','최하위 규정수량(t)','하위 규정수량(t)','상위 규정수량(t)','규정수량 구분','성분판정','제품판정','확인사항','성분별 적용기준','비고','PDF 파일명','PDF 주소','문서ID'];
const chemical=['인체급성유해성물질','인체만성유해성물질','생태유해성물질','사고대비물질'];
const osh=['작업환경측정 대상','특수건강진단 대상','관리대상 유해물질','특별관리물질','노출기준설정물질','허용기준설정물질','공정안전보고서 제출 대상'];
const status=s=>s==='applicable'?'해당':s==='review'?'확인 필요':'해당없음';
export function integratedRows(model,{location=()=>null,pdfUrl=()=>'',fileName=d=>d.file_name || ''}={}) {
 const rows=[];
 for(const product of [...model.products].sort((a,b)=>a.doc.material_name.localeCompare(b.doc.material_name,'ko'))) {
  const doc=product.doc,locations=doc.locations?.length?doc.locations:[null],components=product.components.length?product.components:[null];
  for(const loc of locations)for(const item of components){
   const path=location(loc,doc),c=item?.component || {},decisions=item?.outcome.decisions || [],range=contentRange(c.content);
   const decision=label=>decisions.find(d=>d.label===label);
   const mark=label=>{const d=decision(label);return d?d.status==='applicable'?'○':d.status==='review'?'확인':'' : product.groups.osh.includes(label)?'제품해당':'';};
   const applicable=decisions.filter(d=>d.status==='applicable'&&d.group==='chemical'),accident=applicable.some(d=>d.label==='사고대비물질');
   const quantities=applicable.filter(d=>!accident || d.label==='사고대비물질').flatMap(d=>(d.regulated_quantities || []).map(q=>({...q,label:d.label})));
   const unique=[...new Map(quantities.map(q=>[JSON.stringify(q),q])).values()];
   const quantity=key=>{if(!unique.length)return '';if(unique.length===1 && /^\d+(\.\d+)?$/.test(String(unique[0][key])))return Number(unique[0][key]);return unique.map(q=>q.label+(q.physical_state?' '+q.physical_state:'')+': '+q[key]).join('\n');};
   const danger=product.groups.dangerous.join('\n'),why=[...product.missing,...(item?.outcome.validations || []).map(v=>v.message),...(decisions.some(d=>d.status==='review')?['성분·함량 또는 적용조건 확인 필요']:[])];
   const criteria=decisions.map(d=>`${d.label}: ${d.threshold}% 이상 / 현재 ${c.content || '미입력'} / ${status(d.status)} · ${d.source || ''}${d.detail?' · '+d.detail:''}`).join('\n');
   rows.push([rows.length+1,path?.factory_name || '',path?.department_name || '',path?.equipment_name || '',doc.material_name,product.meta.regulations.physical_state || '',c.name || '',c.cas || '',c.content || '',range?range.min/100:'',range?range.max/100:'',...chemical.map(label=>decision(label)?Number(decision(label).threshold)/100:''),...chemical.map(mark),...osh.map(mark),danger,danger.match(/지정수량\s*([^\n]+)/g)?.map(x=>x.replace(/^지정수량\s*/, '')).join('\n') || '',quantity('lowest_tons'),quantity('lower_tons'),quantity('upper_tons'),unique.map(q=>q.label+(q.physical_state?' · '+q.physical_state:'')).join('\n'),item?status(item.status):'확인 필요',status(product.status),[...new Set(why)].join('\n'),criteria,doc.notes || '',fileName(doc),pdfUrl(doc),doc.id]);
  }
 }
 return rows;
}
export async function integratedWorkbook(JSZip,template,rows){
 const zip=await JSZip.loadAsync(template),sheetPath='xl/worksheets/sheet1.xml';
 let xml=await zip.file(sheetPath).async('string');
 xml=xml.replace(/<(\/?)x:/g,'<$1').replace('xmlns:x=','xmlns=');
 const prototype=xml.match(/<row\b[^>]*\br="5"[^>]*>[\s\S]*?<\/row>/)?.[0];
 if(!prototype)throw new Error('통합 엑셀 서식을 읽지 못했습니다.');
 const styles=[...prototype.matchAll(/<c\b([^>]*)/g)].map(x=>x[1].match(/\bs="(\d+)"/)?.[1] || '0');
 const esc=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const col=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
 const data=rows.map((row,i)=>'<row r="'+(i+5)+'" ht="48" customHeight="1">'+row.map((v,j)=>'<c r="'+col(j)+(i+5)+'" s="'+(styles[j]||0)+'"'+(typeof v==='number'?'':' t="inlineStr"')+'>'+(typeof v==='number'?'<v>'+v+'</v>':'<is><t xml:space="preserve">'+esc(v)+'</t></is>')+'</c>').join('')+'</row>').join('');
 xml=xml.replace(prototype,data).replace(/<dimension\b[^>]*\/>/,'<dimension ref="A1:AN'+Math.max(4,rows.length+4)+'"/>').replace(/sqref="P5:Z5"/g,'sqref="P5:Z'+Math.max(5,rows.length+4)+'"');
 if(!xml.includes('<autoFilter'))xml=xml.replace('</sheetData>','</sheetData><autoFilter ref="A4:AN'+Math.max(4,rows.length+4)+'"/>');
 // Excel requires the formula for a containsText conditional rule.
 xml=xml.replace(/(<cfRule\b[^>]*type="containsText"[^>]*)\/>/g,'$1><formula>NOT(ISERROR(SEARCH("○",P5)))</formula></cfRule>');
 const links=rows.map((r,i)=>({url:r[38],row:i+5})).filter(x=>/^https?:\/\//.test(x.url));
 if(links.length){
   if(!xml.includes('xmlns:r='))xml=xml.replace('<worksheet ','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
   const hyperlinkXml='<hyperlinks>'+links.map((x,i)=>'<hyperlink ref="AM'+x.row+'" r:id="pdf'+i+'"/>').join('')+'</hyperlinks>';
   // CT_Worksheet requires hyperlinks before printOptions/pageMargins.
   xml=xml.replace(/<(printOptions|pageMargins|pageSetup|headerFooter|drawing|legacyDrawing|extLst)\b|<\/worksheet>/,match=>hyperlinkXml+match);
   zip.file('xl/worksheets/_rels/sheet1.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+links.map((x,i)=>'<Relationship Id="pdf'+i+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" TargetMode="External" Target="'+esc(x.url)+'"/>').join('')+'</Relationships>');
 }
 zip.file(sheetPath,xml);
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
