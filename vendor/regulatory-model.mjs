import {assess, requiredFields, excludedComponent} from './legal-engine.mjs?v=VER13_rev.18';
export function regulatoryModel(documents, rules, metadata = d => ({components:d.components || [],regulations:d.regulations || {}})) {
  const ingredients=new Map();
  const products=documents.map(doc=>{
    const meta=metadata(doc), settings={ph:meta.regulations.ph,physicalState:meta.regulations.physical_state};
    const result=assess(meta.components,rules,settings);
    const missing=requiredFields({...doc,components:meta.components,regulations:meta.regulations});
    const review=result.review || missing.length>0 || Boolean(doc.regulations?.pending_revision);
    const groups={chemical:result.regulations.chemical,osh:[...new Set([...(meta.regulations.osh || []),...result.regulations.osh])],dangerous:meta.regulations.dangerous || []};
    const components=meta.components.map((component,index)=>{
      const outcome=assess([component],rules,settings);
      const applied=outcome.decisions.filter(d=>d.status==='applicable');
      const item={component,index,outcome,status:applied.length?'applicable':outcome.review?'review':'not-applicable',applied};
      const cas=String(component.cas || '').trim();
      const key=!excludedComponent(component)&&/^\d{2,7}-\d{2}-\d$/.test(cas)?'cas:'+cas:'row:'+doc.id+':'+index;
      if(!ingredients.has(key))ingredients.set(key,{key,name:component.name || '성분명 확인 필요',cas:cas || '-',entries:[]});
      ingredients.get(key).entries.push({doc,...item});
      return item;
    });
    return {doc,meta,result,components,missing,review,groups,status:Object.values(groups).some(a=>a.length)?'applicable':review?'review':'not-applicable'};
  });
  const rows=[...ingredients.values()].map(row=>({...row,products:[...new Set(row.entries.map(e=>e.doc.id))],review:row.entries.some(e=>e.outcome.review),status:row.entries.some(e=>e.status==='applicable')?'applicable':row.entries.some(e=>e.outcome.review)?'review':'not-applicable'}));
  const counts=Object.fromEntries(['chemical','osh','dangerous'].map(group=>[group,{products:products.filter(p=>p.groups[group].length).length,ingredients:rows.filter(r=>r.entries.some(e=>e.applied.some(d=>d.group===group))).length}]));
  counts.review={products:products.filter(p=>p.review).length};
  return {products,ingredients:rows,counts};
}
