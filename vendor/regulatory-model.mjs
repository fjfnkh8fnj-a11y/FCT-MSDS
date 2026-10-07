import {assess, requiredFields, excludedComponent} from './legal-engine.mjs?v=VER13_rev.22';
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

export function classificationGroups(model) {
  const groups=new Map();
  const add=(key,title,kind,product,ingredient=null)=>{
    if(!groups.has(key))groups.set(key,{key,title,kind,products:new Map(),ingredients:new Map()});
    const g=groups.get(key);g.products.set(product.doc.id,product);
    if(ingredient)g.ingredients.set(ingredient.key,ingredient);
  };
  for(const product of model.products)for(const title of product.groups.dangerous)add('dangerous:'+title,title,'dangerous',product);
  for(const ingredient of model.ingredients)for(const entry of ingredient.entries)for(const decision of entry.applied.filter(d=>d.group==='chemical')) {
    if(decision.label!=='사고대비물질'&&entry.applied.some(d=>d.label==='사고대비물질'))continue;
    const quantities=decision.regulated_quantities || [];
    const m=String(decision.detail || '').match(/(급성|만성|생태|사고대비)\s*최하위\s*([\d.,]+)\s*\/\s*하위\s*([\d.,]+)\s*\/\s*상위\s*([\d.,]+)/);
    const values=quantities.length?quantities:m?[{lowest_tons:m[2],lower_tons:m[3],upper_tons:m[4]}]:[null];
    for(const quantity of values){
      const title=decision.label+' · '+(quantity?(quantity.physical_state?quantity.physical_state+' · ':'')+'최하위 '+quantity.lowest_tons+'t / 하위 '+quantity.lower_tons+'t / 상위 '+quantity.upper_tons+'t':'규정수량 확인 필요');
      add('chemical:'+title,title,'chemical',model.products.find(p=>p.doc.id===entry.doc.id),ingredient);
    }
  }
  return [...groups.values()].map(g=>({...g,products:[...g.products.values()],ingredients:[...g.ingredients.values()]})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title,'ko',{numeric:true}));
}
