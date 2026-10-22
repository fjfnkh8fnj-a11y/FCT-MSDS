// Product/PDF identity stays shared; only locations and management values are scoped.
export function scopeDocuments(documents, factoryId = '') {
  if (!factoryId) return documents;
  return documents.flatMap(doc => {
    const locations = (doc.locations || []).filter(l => l.factory_id === factoryId);
    return locations.length || (!(doc.locations || []).length && doc.factory_id === factoryId)
      ? [{...doc, locations}] : [];
  });
}
export function factoryRecord(records, documentId, factoryId) {
  return records.find(r => r.document_id === documentId && r.factory_id === factoryId) || null;
}
export function replaceFactoryLocations(doc, factoryId, locations) {
  if (!locations.length || locations.some(l => l.factory_id !== factoryId)) throw new Error('선택한 공장의 사용처를 1개 이상 선택해 주세요.');
  return {...doc, locations:[...(doc.locations || []).filter(l => l.factory_id !== factoryId), ...locations]};
}
export function managementRecords(documents) {
  return documents.flatMap(doc => Object.entries(doc.regulations?.factory_management || {}).map(([fid,info]) => ({...info,document_id:doc.id,factory_id:fid})));
}
// Use only the existing documents and document_locations endpoints.
export async function saveFactoryManagement(api, doc, factoryId, next, locations) {
  const path='/rest/v1/documents?id=eq.'+encodeURIComponent(doc.id);
  const fresh=(await api(path+'&select=id,regulations,updated_at'))?.[0];
  if(!fresh || fresh.updated_at!==doc.updated_at)throw new Error('다른 작업에서 변경되었습니다. 다시 열어 저장해 주세요.');
  if(fresh.regulations?._factory_write_lock && Date.parse(fresh.regulations._factory_write_lock)>Date.now())throw new Error('다른 저장이 진행 중입니다. 잠시 후 다시 열어 주세요.');
  const existing=doc.locations.filter(l=>l.factory_id===factoryId);
  if(!existing.length || !locations.length || locations.some(l=>l.factory_id!==factoryId))throw new Error('선택한 공장의 사용처를 확인해 주세요.');
  const patch=(version,regulations)=>api(path+'&updated_at=eq.'+encodeURIComponent(version),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({regulations,updated_at:new Date().toISOString()})});
  const locked=(await patch(fresh.updated_at,{...fresh.regulations,_factory_write_lock:new Date(Date.now()+120000).toISOString()}))?.[0];
  if(!locked)throw new Error('다른 작업에서 변경되었습니다. 다시 열어 저장해 주세요.');
  const inserted=[],removed=[];
  const fields=l=>({...(l.id?{id:l.id}:{}),document_id:doc.id,factory_id:factoryId,department_id:l.department_id,equipment_id:l.equipment_id,process_id:l.process_id || null});
  try {
    const oldIds=new Set(existing.map(l=>l.equipment_id)),keep=new Set(locations.map(l=>l.equipment_id));
    const additions=locations.filter(l=>!oldIds.has(l.equipment_id));
    if(additions.length)inserted.push(...(await api('/rest/v1/document_locations',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(additions.map(fields))}) || []));
    const deletions=existing.filter(l=>!keep.has(l.equipment_id));
    if(deletions.length)removed.push(...(await api('/rest/v1/document_locations?document_id=eq.'+encodeURIComponent(doc.id)+'&factory_id=eq.'+encodeURIComponent(factoryId)+'&id=in.('+deletions.map(l=>encodeURIComponent(l.id)).join(',')+')',{method:'DELETE',headers:{Prefer:'return=representation'}}) || []));
    const info={...next,updated_at:new Date().toISOString()};
    const regulations={...fresh.regulations,factory_management:{...fresh.regulations?.factory_management,[factoryId]:info}};
    const saved=(await patch(locked.updated_at,regulations))?.[0];
    if(!saved)throw new Error('저장 중 다른 변경이 발생했습니다. 다시 불러와 주세요.');
    return saved;
  } catch(error) {
    try {
      const current=(await api(path+'&select=updated_at'))?.[0];
      if(current?.updated_at!==locked.updated_at)throw new Error('동시 변경');
      if(removed.length)await api('/rest/v1/document_locations',{method:'POST',body:JSON.stringify(removed.map(fields))});
      if(inserted.length)await api('/rest/v1/document_locations?id=in.('+inserted.map(l=>encodeURIComponent(l.id)).join(',')+')&factory_id=eq.'+encodeURIComponent(factoryId),{method:'DELETE'});
      if(!(await patch(locked.updated_at,fresh.regulations))?.length)throw new Error('충돌');
    }catch(_){throw new Error('저장 중 연결 또는 동시 변경이 발생했습니다. 새로고침 후 공장별 사용처를 확인해 주세요.');}
    throw error;
  }
}
