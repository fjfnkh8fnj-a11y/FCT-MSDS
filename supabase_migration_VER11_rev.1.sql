-- FCT MSDS VER11_rev.1 기존 데이터 유지형 마이그레이션
-- 공정 단계 제거, 설비 기준 연결, 성분·법적 규제정보 저장 지원

begin;

alter table public.documents
  add column if not exists notes text not null default '',
  add column if not exists components jsonb not null default '[]'::jsonb,
  add column if not exists regulations jsonb not null default '{}'::jsonb;

-- 서로 다른 제품이 같은 MSDS PDF 파일을 공유할 수 있도록 허용
alter table public.documents
  drop constraint if exists documents_factory_id_file_name_key;

alter table public.document_locations
  drop constraint if exists document_locations_process_id_fkey;

alter table public.document_locations
  alter column process_id drop not null;

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
