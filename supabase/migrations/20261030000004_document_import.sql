-- Multi-file document import: specifications, asking price, editable brand
-- list, staging uploads and a single-transaction save.

-- Asking price shown to customers. Not the sale price.
alter table public.vehicles
  add column listing_price numeric(12, 2) check (listing_price >= 0);

-- Brands the company deals in; used only to suggest how a vehicle name splits
-- into brand and model. Starts empty; edited in Settings.
alter table public.companies
  add column known_brands text[] not null default '{}';

-- Everything a document says about a vehicle that is not a core field.
create table public.vehicle_specs (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null default public.current_company_id(),
  vehicle_id          uuid not null,
  section             text,
  label               text not null check (length(trim(label)) > 0),
  label_alt           text,
  value               text not null,
  unit                text,
  source_document_id  uuid references public.documents (id),
  source_page         int check (source_page >= 1),
  verified            boolean not null default false,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index vehicle_specs_vehicle_idx on public.vehicle_specs (vehicle_id, sort_order);

create trigger vehicle_specs_set_company before insert on public.vehicle_specs
  for each row execute function public.set_company_id();
create trigger vehicle_specs_immutable before update on public.vehicle_specs
  for each row execute function public.guard_immutable();
create trigger vehicle_specs_touch before update on public.vehicle_specs
  for each row execute function public.touch_updated_at();
create trigger vehicle_specs_audit after insert or update or delete on public.vehicle_specs
  for each row execute function public.audit_row();

alter table public.vehicle_specs enable row level security;
create policy vehicle_specs_select on public.vehicle_specs for select to authenticated
  using (company_id = public.current_company_id());
create policy vehicle_specs_insert on public.vehicle_specs for insert to authenticated
  with check (company_id = public.current_company_id() and public.can_write());
create policy vehicle_specs_update on public.vehicle_specs for update to authenticated
  using (company_id = public.current_company_id() and public.can_write())
  with check (company_id = public.current_company_id());
-- A wrong spec line can be removed; the audit log keeps it.
create policy vehicle_specs_delete on public.vehicle_specs for delete to authenticated
  using (company_id = public.current_company_id() and public.can_write());

-- Office and spreadsheet originals can now be stored too.
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/csv'
] where id = 'vehicle-files';

-- Import sessions upload before the vehicle may exist: <company>/imports/<session>/<file>.
create policy vehicle_files_imports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-files'
              and (storage.foldername(name))[1] = public.current_company_id()::text
              and (storage.foldername(name))[2] = 'imports'
              and public.can_write());

-- Save a reviewed import in one transaction.
--   p_vehicle_id  existing vehicle, or null to create one from p_fields (chassis_number required)
--   p_fields      reviewed core fields: only the keys present are written
--   p_documents   [{key, storage_path, original_filename, mime_type, file_size, document_type, extracted_text}]
--   p_images      [{storage_path, thumbnail_path, original_filename, mime_type, file_size, image_type}]
--   p_specs       [{section, label, label_alt, value, unit, source_key, source_page, verified}]
-- Every referenced file must already be in this company's storage.
create or replace function public.save_vehicle_import(
  p_vehicle_id uuid,
  p_fields jsonb,
  p_documents jsonb default '[]',
  p_images jsonb default '[]',
  p_specs jsonb default '[]'
) returns uuid language plpgsql set search_path = '' as $$
declare
  vid      uuid := p_vehicle_id;
  company  uuid := public.current_company_id();
  d        jsonb;
  doc_ids  jsonb := '{}';
  new_id   uuid;
  path     text;
  n        int := 0;
  allowed  text[] := array['chassis_number', 'brand', 'model', 'year', 'trim_level', 'exterior_color',
                           'interior_color', 'mileage_km', 'listing_price'];
  k        text;
begin
  if not public.can_write() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  for k in select jsonb_object_keys(coalesce(p_fields, '{}')) loop
    if not k = any(allowed) then
      raise exception 'Unknown field %', k using errcode = '22023';
    end if;
  end loop;

  -- Files: same company, and actually uploaded.
  for path in
    select x ->> 'storage_path' from jsonb_array_elements(p_documents) x
    union all select x ->> 'storage_path' from jsonb_array_elements(p_images) x
    union all select x ->> 'thumbnail_path' from jsonb_array_elements(p_images) x where x ->> 'thumbnail_path' is not null
  loop
    if split_part(path, '/', 1) <> company::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'vehicle-files' and o.name = path) then
      raise exception 'File % is not available', path using errcode = '42501';
    end if;
  end loop;

  if vid is null then
    if coalesce(trim(p_fields ->> 'chassis_number'), '') = '' then
      raise exception 'A new vehicle needs a chassis number' using errcode = '23502';
    end if;
    insert into public.vehicles (chassis_number, brand, model, year, trim_level, exterior_color,
      interior_color, mileage_km, listing_price, arrival_at)
    values (p_fields ->> 'chassis_number', p_fields ->> 'brand', p_fields ->> 'model',
      (p_fields ->> 'year')::int, p_fields ->> 'trim_level', p_fields ->> 'exterior_color',
      p_fields ->> 'interior_color', (p_fields ->> 'mileage_km')::int,
      (p_fields ->> 'listing_price')::numeric, now())
    returning id into vid;
  elsif p_fields <> '{}'::jsonb then
    -- Chassis corrections follow the existing rules (trigger) and reset verification.
    update public.vehicles set
      chassis_number = case when p_fields ? 'chassis_number' then p_fields ->> 'chassis_number' else chassis_number end,
      brand          = case when p_fields ? 'brand' then p_fields ->> 'brand' else brand end,
      model          = case when p_fields ? 'model' then p_fields ->> 'model' else model end,
      year           = case when p_fields ? 'year' then (p_fields ->> 'year')::int else year end,
      trim_level     = case when p_fields ? 'trim_level' then p_fields ->> 'trim_level' else trim_level end,
      exterior_color = case when p_fields ? 'exterior_color' then p_fields ->> 'exterior_color' else exterior_color end,
      interior_color = case when p_fields ? 'interior_color' then p_fields ->> 'interior_color' else interior_color end,
      mileage_km     = case when p_fields ? 'mileage_km' then (p_fields ->> 'mileage_km')::int else mileage_km end,
      listing_price  = case when p_fields ? 'listing_price' then (p_fields ->> 'listing_price')::numeric else listing_price end
    where id = vid;
    if not found then
      raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
    end if;
  end if;

  for d in select * from jsonb_array_elements(p_documents) loop
    insert into public.documents (vehicle_id, document_type, original_filename, storage_path, mime_type, file_size, extracted_text)
    values (vid, coalesce((d ->> 'document_type')::public.document_type, 'other'), d ->> 'original_filename',
      d ->> 'storage_path', d ->> 'mime_type', (d ->> 'file_size')::bigint, nullif(d ->> 'extracted_text', ''))
    returning id into new_id;
    doc_ids := doc_ids || jsonb_build_object(d ->> 'key', new_id);
  end loop;

  for d in select * from jsonb_array_elements(p_images) loop
    if d ->> 'image_type' = 'information_card' then
      raise exception 'Use the information card upload for cards' using errcode = '22023';
    end if;
    insert into public.vehicle_images (vehicle_id, image_type, storage_path, thumbnail_path, original_filename, mime_type, file_size)
    values (vid, (d ->> 'image_type')::public.image_type, d ->> 'storage_path', d ->> 'thumbnail_path',
      d ->> 'original_filename', d ->> 'mime_type', (d ->> 'file_size')::bigint);
  end loop;

  select coalesce(max(sort_order), 0) into n from public.vehicle_specs where vehicle_id = vid;
  for d in select * from jsonb_array_elements(p_specs) loop
    n := n + 1;
    insert into public.vehicle_specs (vehicle_id, section, label, label_alt, value, unit, source_document_id, source_page, verified, sort_order)
    values (vid, nullif(d ->> 'section', ''), d ->> 'label', nullif(d ->> 'label_alt', ''), d ->> 'value', nullif(d ->> 'unit', ''),
      (doc_ids ->> (d ->> 'source_key'))::uuid, (d ->> 'source_page')::int, coalesce((d ->> 'verified')::boolean, true), n);
  end loop;

  insert into public.vehicle_events (vehicle_id, event_type, description)
  values (vid, 'documents_imported', format('%s files, %s specifications',
    jsonb_array_length(p_documents), jsonb_array_length(p_specs)));
  return vid;
end $$;
revoke execute on function public.save_vehicle_import(uuid, jsonb, jsonb, jsonb, jsonb) from anon, public;
grant execute on function public.save_vehicle_import(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- The overview view selects v.*; recreate it so the new column appears.
drop view public.vehicle_overview;
create view public.vehicle_overview with (security_invoker = true) as
select
  v.*,
  coalesce(e.total, 0)::numeric(12, 2) as expense_total,
  coalesce(a.missing, 0) as missing_accessories,
  coalesce(a.unknown, 0) as unknown_accessories,
  coalesce(a.total, 0) as accessory_count,
  coalesce(d.cnt, 0) as document_count,
  cover.thumbnail_path as cover_thumbnail_path
from public.vehicles v
left join lateral (
  select sum(amount) as total from public.expenses
  where vehicle_id = v.id and deleted_at is null
) e on true
left join lateral (
  select count(*) filter (where status = 'missing') as missing,
         count(*) filter (where status = 'unknown') as unknown,
         count(*) as total
  from public.accessories where vehicle_id = v.id
) a on true
left join lateral (
  select count(*) as cnt from public.documents
  where vehicle_id = v.id and deleted_at is null and superseded_at is null
) d on true
left join lateral (
  select coalesce(thumbnail_path, storage_path) as thumbnail_path from public.vehicle_images
  where vehicle_id = v.id and deleted_at is null and superseded_at is null
  order by case image_type when 'current' then 0 when 'arrival' then 1 when 'information_card' then 2 else 3 end,
           uploaded_at desc
  limit 1
) cover on true;

revoke all on public.vehicle_specs, public.vehicle_overview from anon;
