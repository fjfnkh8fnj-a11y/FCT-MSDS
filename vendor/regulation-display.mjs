const priority={review:0,applicable:1,'not-applicable':2,unmatched:3,excluded:4};
export function productAssessments(assessments=[]) {
  const map=new Map();
  for(const a of assessments) {
    const key=a.doc.id;
    if(!map.has(key)) map.set(key,{doc:a.doc,status:a.status,contents:[],bases:[],reviewReasons:[]});
    const row=map.get(key);
    if(priority[a.status]<priority[row.status]) row.status=a.status;
    row.contents.push(a.component.content || '미입력');
    if(a.basis) row.bases.push(a.basis);
    for(const d of a.decisions || []) if(d.status==='review') {
      row.reviewReasons.push(d.detail?.includes('pH 2.0') ? `${d.label} · 제품 pH 조건 확인 필요` : `${d.label} · 함량 ${d.content}가 기준 ${d.threshold}% 이상에 걸침`);
    }
    if(a.status==='review' && !(a.decisions || []).some(d=>d.status==='review') && a.basis) row.reviewReasons.push(a.basis);
  }
  return [...map.values()].map(r=>({...r,contents:[...new Set(r.contents)],bases:[...new Set(r.bases)],reviewReasons:[...new Set(r.reviewReasons)]})).sort((a,b)=>priority[a.status]-priority[b.status] || a.doc.material_name.localeCompare(b.doc.material_name,'ko'));
}
