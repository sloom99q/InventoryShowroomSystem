-- Triggers, row level security, RPCs, views and storage.

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_company_id()
returns trigger language plpgsql as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Ownership and file references never change after insert.
create or replace function public.guard_immutable()
returns trigger language plpgsql as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id cannot be changed' using errcode = '42501';
  end if;
  if tg_table_name <> 'vehicles' and (to_jsonb(new) ->> 'vehicle_id') is distinct from (to_jsonb(old) ->> 'vehicle_id') then
    raise exception 'vehicle_id cannot be changed; upload to the correct vehicle instead' using errcode = '42501';
  end if;
  if (to_jsonb(new) ->> 'storage_path') is distinct from (to_jsonb(old) ->> 'storage_path') then
    raise exception 'stored files cannot be swapped; upload a new version' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'documents', 'vehicle_images', 'accessories', 'expenses', 'vehicle_events', 'document_jobs'] loop
    execute format('create trigger %I_set_company before insert on public.%I for each row execute function public.set_company_id()', t, t);
  end loop;
  foreach t in array array['vehicles', 'documents', 'vehicle_images', 'accessories', 'expenses'] loop
    execute format('create trigger %I_immutable before update on public.%I for each row execute function public.guard_immutable()', t, t);
  end loop;
  foreach t in array array['vehicles', 'accessories', 'expenses'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Only admins and secretaries may correct a chassis number (it is the identity).
create or replace function public.guard_chassis_change()
returns trigger language plpgsql as $$
begin
  if new.chassis_number is distinct from old.chassis_number then
    if coalesce(public.current_app_role() not in ('admin', 'secretary'), true)
       and current_setting('role', true) = 'authenticated' then
      raise exception 'Only an admin or secretary can change a chassis number' using errcode = '42501';
    end if;
    -- A corrected chassis must be re-verified.
    if new.chassis_verified and old.chassis_verified then
      new.chassis_verified := false;
    end if;
  end if;
  return new;
end $$;

create trigger vehicles_chassis_guard before update on public.vehicles
  for each row execute function public.guard_chassis_change();

-- ---------------------------------------------------------------------------
-- Timeline events (automatic, so no code path can skip them)
-- ---------------------------------------------------------------------------
create or replace function public.log_vehicle_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(current_setting('app.status_note', true), '');
  v_at   timestamptz := coalesce(nullif(current_setting('app.status_at', true), '')::timestamptz, now());
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_events (company_id, vehicle_id, event_type, to_status, event_at, description, created_by)
    values (new.company_id, new.id, 'registered', new.status, coalesce(new.arrival_at, now()), 'Vehicle registered', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.vehicle_events (company_id, vehicle_id, event_type, from_status, to_status, event_at, description, created_by)
    values (new.company_id, new.id, 'status_change', old.status, new.status, v_at, v_note, auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at then
    insert into public.vehicle_events (company_id, vehicle_id, event_type, event_at, description, created_by)
    values (new.company_id, new.id, case when new.archived_at is null then 'restored' else 'archived' end, now(), v_note, auth.uid());
  end if;
  return new;
end $$;

create trigger vehicles_events after insert or update on public.vehicles
  for each row execute function public.log_vehicle_events();

-- ---------------------------------------------------------------------------
-- Audit log (who changed what, when)
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec     jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  prev    jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  nxt     jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  action  text := lower(tg_op);
  k       text;
begin
  if tg_op = 'UPDATE' then
    -- Keep only changed keys so the log reads as a diff.
    for k in select jsonb_object_keys(nxt) loop
      if prev -> k = nxt -> k then
        prev := prev - k; nxt := nxt - k;
      end if;
    end loop;
    nxt := nxt - 'updated_at'; prev := prev - 'updated_at';
    if nxt = '{}'::jsonb then return null; end if;
    if nxt ? 'deleted_at' and (nxt ->> 'deleted_at') is not null then action := 'soft_delete'; end if;
    if nxt ? 'archived_at' then action := case when (nxt ->> 'archived_at') is null then 'restore' else 'archive' end; end if;
  end if;
  insert into public.audit_logs (company_id, user_id, entity_type, entity_id, vehicle_id, action, previous_values, new_values)
  values (
    (rec ->> 'company_id')::uuid,
    auth.uid(),
    tg_table_name,
    (rec ->> 'id')::uuid,
    case when tg_table_name = 'vehicles' then (rec ->> 'id')::uuid else (rec ->> 'vehicle_id')::uuid end,
    action, prev, nxt
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'documents', 'vehicle_images', 'accessories', 'expenses', 'profiles'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.companies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.vehicles        enable row level security;
alter table public.documents       enable row level security;
alter table public.vehicle_images  enable row level security;
alter table public.accessories     enable row level security;
alter table public.expenses        enable row level security;
alter table public.vehicle_events  enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.document_jobs   enable row level security;

create policy companies_select on public.companies for select to authenticated
  using (id = public.current_company_id());
create policy companies_update on public.companies for update to authenticated
  using (id = public.current_company_id() and public.is_admin())
  with check (id = public.current_company_id());

create policy profiles_select on public.profiles for select to authenticated
  using (company_id = public.current_company_id());
create policy profiles_update on public.profiles for update to authenticated
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id());

-- Business tables: everyone in the company reads, writers insert/update.
-- No DELETE policies: removal is archive / soft delete only.
do $$
declare t text;
begin
  foreach t in array array['vehicles', 'documents', 'vehicle_images', 'accessories', 'expenses'] loop
    execute format($f$
      create policy %1$I_select on public.%1$I for select to authenticated
        using (company_id = public.current_company_id());
      create policy %1$I_insert on public.%1$I for insert to authenticated
        with check (company_id = public.current_company_id() and public.can_write());
      create policy %1$I_update on public.%1$I for update to authenticated
        using (company_id = public.current_company_id() and public.can_write())
        with check (company_id = public.current_company_id());
    $f$, t);
  end loop;
end $$;

-- Accessories are a checklist; removing a wrongly-added line is allowed.
create policy accessories_delete on public.accessories for delete to authenticated
  using (company_id = public.current_company_id() and public.can_write());

create policy vehicle_events_select on public.vehicle_events for select to authenticated
  using (company_id = public.current_company_id());
create policy vehicle_events_insert on public.vehicle_events for insert to authenticated
  with check (company_id = public.current_company_id() and public.can_write());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (company_id = public.current_company_id() and public.current_app_role() in ('admin', 'secretary'));

create policy document_jobs_select on public.document_jobs for select to authenticated
  using (company_id = public.current_company_id());
create policy document_jobs_insert on public.document_jobs for insert to authenticated
  with check (company_id = public.current_company_id() and public.can_write());
create policy document_jobs_update on public.document_jobs for update to authenticated
  using (company_id = public.current_company_id() and public.can_write())
  with check (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- RPCs for multi-record actions (SECURITY INVOKER: RLS still applies)
-- ---------------------------------------------------------------------------
create or replace function public.change_vehicle_status(
  p_vehicle_id uuid,
  p_status public.vehicle_status,
  p_event_at timestamptz default null,
  p_note text default null
) returns public.vehicles language plpgsql set search_path = '' as $$
declare
  v public.vehicles;
  at timestamptz := coalesce(p_event_at, now());
begin
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  perform set_config('app.status_at', at::text, true);
  update public.vehicles set
    status = p_status,
    sold_at = case
      when p_status = 'sold' then at
      when p_status in ('in_stock', 'in_garage', 'reserved') then null
      else coalesce(sold_at, at) end,
    delivered_at = case
      when p_status = 'delivered' then at
      when p_status <> 'delivered' then null
      else delivered_at end
  where id = p_vehicle_id
  returning * into v;
  if v.id is null then
    raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
  end if;
  return v;
end $$;

create or replace function public.archive_vehicle(p_vehicle_id uuid, p_archive boolean, p_note text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if not public.current_app_role() in ('admin', 'secretary') then
    raise exception 'Only an admin or secretary can archive vehicles' using errcode = '42501';
  end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.vehicles set archived_at = case when p_archive then now() else null end
  where id = p_vehicle_id;
  if not found then
    raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
  end if;
end $$;

-- Replace a document with a new version, keeping the old one.
create or replace function public.add_document_version(
  p_previous_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_notes text default null
) returns public.documents language plpgsql set search_path = '' as $$
declare
  prev public.documents;
  doc  public.documents;
begin
  select * into prev from public.documents
  where id = p_previous_id and superseded_at is null and deleted_at is null
  for update;
  if prev.id is null then
    raise exception 'Document not found, already replaced, or not permitted' using errcode = 'P0002';
  end if;
  update public.documents set superseded_at = now() where id = prev.id;
  insert into public.documents (company_id, vehicle_id, group_id, version, document_type,
    original_filename, storage_path, mime_type, file_size, notes)
  values (prev.company_id, prev.vehicle_id, prev.group_id, prev.version + 1, prev.document_type,
    p_original_filename, p_storage_path, p_mime_type, p_file_size, coalesce(p_notes, prev.notes))
  returning * into doc;
  return doc;
end $$;

-- Set the vehicle's information card; previous cards are kept as history.
create or replace function public.set_information_card(
  p_vehicle_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_thumbnail_path text default null
) returns public.vehicle_images language plpgsql set search_path = '' as $$
declare img public.vehicle_images;
begin
  update public.vehicle_images set superseded_at = now()
  where vehicle_id = p_vehicle_id and image_type = 'information_card'
    and superseded_at is null and deleted_at is null;
  insert into public.vehicle_images (vehicle_id, company_id, image_type, storage_path, thumbnail_path,
    original_filename, mime_type, file_size)
  select v.id, v.company_id, 'information_card', p_storage_path, p_thumbnail_path,
    p_original_filename, p_mime_type, p_file_size
  from public.vehicles v where v.id = p_vehicle_id
  returning * into img;
  if img.id is null then
    raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
  end if;
  return img;
end $$;

-- All-or-nothing spreadsheet import. Rows are JSON objects using vehicle
-- column names; duplicates abort the whole import with a clear message.
create or replace function public.import_vehicles(p_rows jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  r jsonb;
  n int := 0;
  dup text;
begin
  if not public.can_write() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  select string_agg(distinct x ->> 'chassis_number', ', ') into dup
  from jsonb_array_elements(p_rows) x
  join public.vehicles v on v.chassis_normalized = public.normalize_chassis(x ->> 'chassis_number')
   and v.company_id = public.current_company_id();
  if dup is not null then
    raise exception 'These chassis numbers already exist: %', dup using errcode = '23505';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.vehicles (chassis_number, brand, model, year, trim_level, exterior_color,
      interior_color, mileage_km, location, status, arrival_at, sold_at, delivered_at,
      acquisition_price, sale_price, notes)
    values (
      r ->> 'chassis_number', r ->> 'brand', r ->> 'model', (r ->> 'year')::int, r ->> 'trim_level',
      r ->> 'exterior_color', r ->> 'interior_color', (r ->> 'mileage_km')::int, r ->> 'location',
      coalesce((r ->> 'status')::public.vehicle_status, 'in_stock'),
      (r ->> 'arrival_at')::timestamptz, (r ->> 'sold_at')::timestamptz, (r ->> 'delivered_at')::timestamptz,
      (r ->> 'acquisition_price')::numeric, (r ->> 'sale_price')::numeric, r ->> 'notes'
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
create or replace view public.vehicle_overview with (security_invoker = true) as
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

create or replace function public.dashboard_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'total',      count(*) filter (where archived_at is null),
    'in_stock',   count(*) filter (where archived_at is null and status = 'in_stock'),
    'in_garage',  count(*) filter (where archived_at is null and status = 'in_garage'),
    'reserved',   count(*) filter (where archived_at is null and status = 'reserved'),
    'sold',       count(*) filter (where archived_at is null and status in ('sold', 'delivered')),
    'unverified_chassis', count(*) filter (where archived_at is null and not chassis_verified),
    'unverified_documents', (select count(*) from public.documents
                             where deleted_at is null and superseded_at is null
                               and verification_status = 'unverified'),
    'expense_total', (select coalesce(sum(amount), 0) from public.expenses ex
                      join public.vehicles vv on vv.id = ex.vehicle_id
                      where ex.deleted_at is null and vv.archived_at is null)
  )
  from public.vehicles
$$;

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants table privileges by default; keep RPCs explicit)
-- ---------------------------------------------------------------------------
revoke all on public.audit_logs from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket, objects keyed by company
--   <company_id>/<vehicle_id>/<kind>/<uuid>.<ext>
-- Originals are never overwritten or deleted by the app.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-files', 'vehicle-files', false, 52428800,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy vehicle_files_select on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-files'
         and (storage.foldername(name))[1] = public.current_company_id()::text);

create policy vehicle_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-files'
              and (storage.foldername(name))[1] = public.current_company_id()::text
              and public.can_write()
              and exists (select 1 from public.vehicles v
                          where v.id::text = (storage.foldername(name))[2]
                            and v.company_id = public.current_company_id()));
