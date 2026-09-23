-- FCT MSDS VER10_rev.1 신규 데이터베이스 및 간편 비밀번호 운영 설정
-- Supabase SQL Editor에서 전체 실행합니다.
-- 관리자 비밀번호는 웹 화면에서 확인하는 간편 잠금 방식입니다.
-- 따라서 이 설정은 사내 편의용이며 강한 보안이 필요한 외부 서비스에는 적합하지 않습니다.

create extension if not exists pgcrypto;

create table if not exists public.factories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references public.factories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique(factory_id,name)
);

create table if not exists public.equipments (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique(department_id,name)
);

create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  name text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique(equipment_id,name)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references public.factories(id) on delete cascade,
  material_name text not null,
  notes text not null default '',
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(factory_id,file_name)
);

create table if not exists public.document_locations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  factory_id uuid not null references public.factories(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_id,equipment_id)
);

insert into public.factories(name,sort_order)
values ('1공장',1),('2공장',2)
on conflict(name) do nothing;

alter table public.factories enable row level security;
alter table public.departments enable row level security;
alter table public.equipments enable row level security;
alter table public.processes enable row level security;
alter table public.documents enable row level security;
alter table public.document_locations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['factories','departments','equipments','processes','documents','document_locations'] loop
    execute format('drop policy if exists "public read" on public.%I',t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)',t);
    execute format('drop policy if exists "admin insert" on public.%I',t);
    execute format('drop policy if exists "admin update" on public.%I',t);
    execute format('drop policy if exists "admin delete" on public.%I',t);
    execute format('drop policy if exists "simple password insert" on public.%I',t);
    execute format('create policy "simple password insert" on public.%I for insert to anon, authenticated with check (true)',t);
    execute format('drop policy if exists "simple password update" on public.%I',t);
    execute format('create policy "simple password update" on public.%I for update to anon, authenticated using (true) with check (true)',t);
    execute format('drop policy if exists "simple password delete" on public.%I',t);
    execute format('create policy "simple password delete" on public.%I for delete to anon, authenticated using (true)',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('msds','msds',true,52428800,array['application/pdf'])
on conflict(id) do update set public=true,file_size_limit=52428800,allowed_mime_types=array['application/pdf'];

drop policy if exists "public msds read" on storage.objects;
create policy "public msds read" on storage.objects for select to anon,authenticated using (bucket_id='msds');
drop policy if exists "admin msds insert" on storage.objects;
drop policy if exists "admin msds update" on storage.objects;
drop policy if exists "admin msds delete" on storage.objects;
drop policy if exists "simple password msds insert" on storage.objects;
create policy "simple password msds insert" on storage.objects for insert to anon,authenticated with check (bucket_id='msds');
drop policy if exists "simple password msds update" on storage.objects;
create policy "simple password msds update" on storage.objects for update to anon,authenticated using (bucket_id='msds') with check (bucket_id='msds');
drop policy if exists "simple password msds delete" on storage.objects;
create policy "simple password msds delete" on storage.objects for delete to anon,authenticated using (bucket_id='msds');
