// Keep source rows separate even when their displayed CAS values are identical.
const secret = /영업\s*[비기]밀|기밀|trade[\s-]*secret|proprietary|confidential|비공개|비대상물질|규제되지 않는 성분|T-\d{4}-\d{5}/i;
export const undisclosedComponent = c => Boolean(c?.undisclosed) || secret.test([c?.name,c?.cas,c?.content].join(' '));
export function normalizeComponents(rows = []) {
  return rows.map(c => undisclosedComponent(c) ? {
    ...c, undisclosed: true,
    source_values: c.source_values || {name:c.name || '',cas:c.cas || '',content:c.content || ''},
    name:'-', cas:'-', content:'-', legal_status:'excluded', regulations:{},
  } : {...c});
}
export function validCas(value) {
  const s=String(value || '').replace(/\s/g,'');
  if (!/^\d{2,7}-\d{2}-\d$/.test(s)) return false;
  const digits=s.replace(/-/g,'');
  return [...digits.slice(0,-1)].reverse().reduce((sum,d,i)=>sum+Number(d)*(i+1),0)%10===Number(digits.at(-1));
}
export function requiredFields(doc) {
  const missing=[];
  if (!String(doc.material_name || '').trim()) missing.push('제품명');
  if (!doc.regulations?.physical_state) missing.push('성상');
  const rows=doc.components || [];
  if (!rows.length && !doc.regulations?.no_listed_components) missing.push('성분');
  rows.forEach((c,i)=>{
    if(undisclosedComponent(c)) return;
    if(!String(c.name || '').trim() || c.name==='-') missing.push(`${i+1}행 성분명`);
    if(!validCas(c.cas)) missing.push(`${i+1}행 CAS No.`);
    if(!/\d|balance|잔량|trace/i.test(c.content || '') || /미입력|판독불가/.test(c.content)) missing.push(`${i+1}행 함량`);
  });
  return missing;
}
export function valuesOf(doc) {
  return {material_name:doc.material_name,components:normalizeComponents(doc.components),physical_state:doc.regulations?.physical_state || ''};
}
export function effectiveDocument(doc) {
  const approved=doc.regulations?.admin_values;
  return approved ? {...doc,material_name:approved.material_name,components:normalizeComponents(approved.components),regulations:{...doc.regulations,physical_state:approved.physical_state}} : {...doc,components:normalizeComponents(doc.components)};
}
export function confirmValues(doc) {
  const current=valuesOf(doc);
  return {...doc,components:current.components,regulations:{...doc.regulations,
    auto_values:doc.regulations?.auto_values || current,admin_values:current,
    admin_confirmed_at:new Date().toISOString(),pending_revision:null,missing_fields:requiredFields(doc)}};
}

