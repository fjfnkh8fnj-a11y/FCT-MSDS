import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeDocuments,replaceFactoryLocations,managementRecords,saveFactoryManagement} from '../vendor/factory-scope.mjs';
const base=()=>({id:'shared',updated_at:'v1',file_name:'one.pdf',storage_path:'shared/one.pdf',components:[{name:'MEK',cas:'78-93-3',content:'3%'}],regulations:{osh:['관리대상 유해물질'],factory_management:{two:{notes:'2공장 기존',max_storage_quantity:80}}},locations:[{id:'a',factory_id:'one',equipment_id:'a',department_id:'d1'},{id:'b',factory_id:'two',equipment_id:'b',department_id:'d2'}]});
test('factory filtering keeps a single shared PDF and does not mutate the source',()=>{
 const doc=base(),docs=[doc,{id:'only2',factory_id:'two',locations:[]}];
 assert.equal(scopeDocuments(docs).length,2);assert.equal(scopeDocuments(docs,'one').length,1);
 const scoped=scopeDocuments(docs,'one')[0];assert.equal(scoped.storage_path,doc.storage_path);assert.deepEqual(scoped.components,doc.components);assert.equal(scoped.locations.length,1);assert.equal(doc.locations.length,2);
 assert.equal(managementRecords(docs)[0].factory_id,'two');
 assert.deepEqual(replaceFactoryLocations(doc,'one',[{factory_id:'one',equipment_id:'new'}]).locations.map(l=>l.equipment_id),['b','new']);
});
function server(failDelete=false){
 let doc=base(),locations=structuredClone(doc.locations),version=1;
 const api=async(url,opts={})=>{
  if(url.startsWith('/rest/v1/documents')){
   if(!opts.method)return [{...structuredClone(doc)}];
   if(!url.endsWith(encodeURIComponent(doc.updated_at)))return [];
   Object.assign(doc,JSON.parse(opts.body),{updated_at:'v'+(++version)});return [structuredClone(doc)];
  }
  if(opts.method==='POST'){const rows=JSON.parse(opts.body).map((l,i)=>({...l,id:l.id||'new'+i}));locations.push(...rows);return rows;}
  if(opts.method==='DELETE'){
   if(failDelete&&url.includes('document_id')){failDelete=false;throw new Error('연결 실패');}
   const ids=url.match(/id=in\.\(([^)]+)\)/)[1].split(',');const removed=locations.filter(l=>ids.includes(l.id));locations=locations.filter(l=>!ids.includes(l.id));return removed;
  }
 };
 return {api,read:()=>({doc,locations})};
}
test('factory save preserves the other factory, PDF, components and legal criteria',async()=>{
 const s=server();await saveFactoryManagement(s.api,base(),'one',{notes:'1공장 변경',max_storage_quantity:40,storage_unit:'kg'},[{factory_id:'one',equipment_id:'new',department_id:'d1'}]);
 const {doc,locations}=s.read();assert.equal(doc.regulations.factory_management.two.max_storage_quantity,80);assert.equal(doc.regulations.factory_management.one.max_storage_quantity,40);assert.equal(doc.storage_path,base().storage_path);assert.deepEqual(doc.components,base().components);assert.equal(locations.find(l=>l.factory_id==='two').id,'b');assert(!doc.regulations._factory_write_lock);
});
test('stale edits are rejected and a failed location save restores the prior state',async()=>{
 const s=server(true);await assert.rejects(saveFactoryManagement(s.api,{...base(),updated_at:'old'},'one',{},base().locations.slice(0,1)),/변경/);
 await assert.rejects(saveFactoryManagement(s.api,base(),'one',{notes:'실패'},[{factory_id:'one',equipment_id:'new',department_id:'d1'}]),/연결 실패/);
 assert.deepEqual(s.read().doc.regulations,base().regulations);assert.deepEqual(s.read().locations,base().locations);
});
