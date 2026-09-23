-- FCT MSDS VER10_rev.1
-- 기존 물질/PDF와 공장·부서·설비 연결은 유지하고 공정 데이터만 제거합니다.

begin;

alter table public.documents
  add column if not exists notes text not null default '';

alter table public.document_locations
  drop constraint if exists document_locations_process_id_fkey;

alter table public.document_locations
  alter column process_id drop not null;

-- 같은 물질이 같은 설비의 여러 공정에 연결된 경우 설비 연결 한 건만 보존합니다.
delete from public.document_locations a
using public.document_locations b
where a.document_id = b.document_id
  and a.equipment_id = b.equipment_id
  and a.id::text > b.id::text;

update public.document_locations
set process_id = null;

delete from public.processes;

drop index if exists public.document_locations_document_process_uidx;
alter table public.document_locations
  drop constraint if exists document_locations_document_id_process_id_key;

create unique index if not exists document_locations_document_equipment_uidx
  on public.document_locations(document_id, equipment_id);

alter table public.document_locations
  add constraint document_locations_process_id_fkey
  foreign key (process_id) references public.processes(id) on delete set null;

commit;

notify pgrst, 'reload schema';
