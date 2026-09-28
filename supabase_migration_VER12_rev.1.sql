-- FCT MSDS VER12_rev.1 데이터 구조 보완
-- 제품/PDF 원본은 1개만 두고 공장·부서·설비는 document_locations에서 다중 연결합니다.

begin;

alter table public.documents
  add column if not exists master_key text,
  add column if not exists legal_reviewed_at timestamptz;

update public.documents
set master_key = lower(regexp_replace(trim(material_name), '\\s+', ' ', 'g'))
where master_key is null or master_key = '';

create index if not exists documents_master_key_idx
  on public.documents(master_key);

-- 동일 제품이 1·2공장 설비에 함께 연결될 수 있도록 위치 중복 기준은
-- 제품 원본 + 설비 조합으로 유지합니다.
drop index if exists public.document_locations_document_process_uidx;
create unique index if not exists document_locations_document_equipment_uidx
  on public.document_locations(document_id, equipment_id);

commit;

notify pgrst, 'reload schema';

-- 주의: 기존 동명이 제품은 자동 삭제하지 않습니다.
-- 제조사·제품번호·개정본이 실제로 같은지 관리자 확인 후 병합해야 합니다.
