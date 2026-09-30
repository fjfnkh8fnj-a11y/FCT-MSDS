-- Enforce approved values for every writer, including older clients and imports.
-- Uses existing table permissions; does not grant or widen access.
create or replace function public.protect_document_values()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  action text := coalesce(new.regulations->>'_value_action','');
  approved jsonb := old.regulations->'admin_values';
  auto_values jsonb := old.regulations->'auto_values';
  candidate jsonb;
  incoming_values jsonb := jsonb_build_object('material_name',new.material_name,'components',new.components,'physical_state',coalesce(new.regulations->>'physical_state',''));
begin
  new.regulations := coalesce(new.regulations,'{}'::jsonb) - '_value_action';
  if action = 'confirm' and new.storage_path is not distinct from old.storage_path then
    candidate := jsonb_build_object('material_name',new.material_name,'components',new.components,'physical_state',coalesce(new.regulations->>'physical_state',''));
    new.regulations := new.regulations || jsonb_build_object('admin_values',candidate,'admin_confirmed_at',clock_timestamp(),'pending_revision',null,
      'auto_values',coalesce(auto_values,jsonb_build_object('material_name',old.material_name,'components',old.components,'physical_state',coalesce(old.regulations->>'physical_state',''))));
  elsif action = 'restore' and auto_values is not null and auto_values <> 'null'::jsonb then
    new.material_name := auto_values->>'material_name';
    new.components := auto_values->'components';
    new.regulations := new.regulations || jsonb_build_object('admin_values',null,'admin_confirmed_at',null,'pending_revision',null,'physical_state',auto_values->>'physical_state','auto_values',auto_values);
  elsif approved is not null and approved <> 'null'::jsonb then
    new.material_name := approved->>'material_name';
    new.components := approved->'components';
    new.regulations := new.regulations || jsonb_build_object('admin_values',approved,'admin_confirmed_at',old.regulations->'admin_confirmed_at','physical_state',approved->>'physical_state');
    if new.storage_path is distinct from old.storage_path then
      candidate := new.regulations->'auto_values';
      if candidate is null or candidate = 'null'::jsonb or candidate = auto_values then
        candidate := incoming_values;
        new.regulations := new.regulations || jsonb_build_object('pending_revision',jsonb_build_object('file_name',new.file_name,'values',candidate,'requires_extraction',true));
      elsif candidate is distinct from approved then
        new.regulations := new.regulations || jsonb_build_object('pending_revision',jsonb_build_object('file_name',new.file_name,'values',candidate));
      end if;
    else
      new.regulations := new.regulations || jsonb_build_object('auto_values',auto_values,'pending_revision',old.regulations->'pending_revision');
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_document_values before update on public.documents
for each row execute function public.protect_document_values();

