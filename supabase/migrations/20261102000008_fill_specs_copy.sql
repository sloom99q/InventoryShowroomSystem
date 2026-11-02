-- "Copy from a previous car" (pilot feedback): copied spec rows remember their
-- source until someone changes them.

alter table public.vehicle_specs
  add column copied_from_vehicle_id uuid references public.vehicles (id) on delete set null;

-- Any edit of a copied value makes it this car's own value.
create or replace function public.clear_copied_marker()
returns trigger language plpgsql as $$
begin
  if (new.value_en is distinct from old.value_en or new.value_ar is distinct from old.value_ar)
     and new.copied_from_vehicle_id is not distinct from old.copied_from_vehicle_id then
    new.copied_from_vehicle_id := null;
  end if;
  return new;
end $$;

create trigger vehicle_specs_clear_copied before update on public.vehicle_specs
  for each row execute function public.clear_copied_marker();

-- Copy the spec fields (English + Arabic), lists and key features of p_source
-- into p_target. Only EMPTY fields and EMPTY lists of the target are filled.
-- Never copied: chassis, price, photos, dates, expenses, accessories, documents,
-- "Other" rows — they don't live in field rows, and only field rows are read.
create or replace function public.copy_specs_from(p_target uuid, p_source uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  n_fields int := 0;
  n_items  int := 0;
  n_kept   int := 0;
  s        public.vehicle_specs;
  next_sort int;
begin
  if not public.can_write() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_target = p_source then
    raise exception 'Choose a different car to copy from' using errcode = '22023';
  end if;
  -- Both cars must be visible to the caller (RLS: same company).
  if (select count(*) from public.vehicles where id in (p_target, p_source)) <> 2 then
    raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order), 0) into next_sort from public.vehicle_specs where vehicle_id = p_target;

  -- Single-value fields.
  for s in
    select * from public.vehicle_specs
    where vehicle_id = p_source and field_key is not null and position is null
    order by sort_order
  loop
    if exists (select 1 from public.vehicle_specs t where t.vehicle_id = p_target and t.field_key = s.field_key and t.position is null) then
      n_kept := n_kept + 1;
      continue;
    end if;
    next_sort := next_sort + 1;
    insert into public.vehicle_specs (vehicle_id, field_key, section, label, label_alt, value_en, value_ar, unit, verified, sort_order, copied_from_vehicle_id)
    values (p_target, s.field_key, s.section, s.label, s.label_alt, s.value_en, s.value_ar, s.unit, s.verified, next_sort, p_source);
    n_fields := n_fields + 1;
  end loop;

  -- Lists and key features: a list is copied whole, only if the target's is empty.
  for s in
    select * from public.vehicle_specs src
    where src.vehicle_id = p_source and src.field_key is not null and src.position is not null
      and not exists (select 1 from public.vehicle_specs t where t.vehicle_id = p_target and t.field_key = src.field_key and t.position is not null)
    order by src.field_key, src.position
  loop
    next_sort := next_sort + 1;
    insert into public.vehicle_specs (vehicle_id, field_key, position, section, label, label_alt, value_en, value_ar, unit, verified, sort_order, copied_from_vehicle_id)
    values (p_target, s.field_key, s.position, s.section, s.label, s.label_alt, s.value_en, s.value_ar, s.unit, s.verified, next_sort, p_source);
    n_items := n_items + 1;
  end loop;

  insert into public.vehicle_events (vehicle_id, event_type, description)
  values (p_target, 'specs_copied', format('Specs copied from %s (%s fields, %s list items)',
    (select concat_ws(' ', brand, model, year, '·', chassis_number) from public.vehicles where id = p_source), n_fields, n_items));

  return jsonb_build_object('fields', n_fields, 'items', n_items, 'kept', n_kept);
end $$;
revoke execute on function public.copy_specs_from(uuid, uuid) from anon, public;
grant execute on function public.copy_specs_from(uuid, uuid) to authenticated;
