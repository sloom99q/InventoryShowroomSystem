-- Rebuild v3 (manual-first): the car's journey, labels, accessory quantities,
-- photo order and cover, and realtime.

-- 1. Stages: the showroom's own list (name, colour, order), editable in Settings.
--    Each stage says what it means for the car's status, so stock counts, sold and
--    delivered dates keep working whatever the stages are called.
create table public.stages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  name_en    text not null check (length(btrim(name_en)) > 0),
  name_ar    text,
  color      text not null default '#5b6470' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position   integer not null,
  status     public.vehicle_status not null default 'in_stock',
  created_at timestamptz not null default now(),
  unique (id, company_id)
);
create index stages_company_idx on public.stages (company_id, position);
create trigger stages_set_company before insert on public.stages for each row execute function public.set_company_id();
create trigger stages_audit after insert or update or delete on public.stages for each row execute function public.audit_row();
alter table public.stages enable row level security;
create policy stages_select on public.stages for select to authenticated using (company_id = public.current_company_id());
create policy stages_insert on public.stages for insert to authenticated with check (company_id = public.current_company_id() and public.is_admin());
create policy stages_update on public.stages for update to authenticated
  using (company_id = public.current_company_id() and public.is_admin()) with check (company_id = public.current_company_id());
create policy stages_delete on public.stages for delete to authenticated using (company_id = public.current_company_id() and public.is_admin());

create or replace function public.seed_default_stages(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.stages (company_id, name_en, name_ar, color, position, status) values
    (p_company, 'Arrived',   'وصلت',          '#5b6470', 1, 'in_stock'),
    (p_company, 'In garage', 'في الكراج',     '#b86e00', 2, 'in_garage'),
    (p_company, 'At RTA',    'في هيئة الطرق', '#1f5fbf', 3, 'in_stock'),
    (p_company, 'Ready',     'جاهزة',         '#16824f', 4, 'in_stock'),
    (p_company, 'Reserved',  'محجوزة',        '#6a3fc1', 5, 'reserved'),
    (p_company, 'Sold',      'مباعة',         '#c8102e', 6, 'sold'),
    (p_company, 'Delivered', 'تم التسليم',    '#16181b', 7, 'delivered');
$$;
revoke all on function public.seed_default_stages(uuid) from public, anon, authenticated;
select public.seed_default_stages(id) from public.companies;

create or replace function public.companies_seed_stages()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_stages(new.id);
  return new;
end $$;
create trigger companies_seed_stages after insert on public.companies for each row execute function public.companies_seed_stages();

-- 2. The car's current stage, and free labels ("Tint pending", "Export papers").
alter table public.vehicles
  add column stage_id uuid,
  add column labels text[] not null default '{}',
  add constraint vehicles_stage_fk foreign key (stage_id, company_id) references public.stages (id, company_id);
create index vehicles_stage_idx on public.vehicles (stage_id);

update public.vehicles v set stage_id = (
  select s.id from public.stages s where s.company_id = v.company_id
  order by (s.status = v.status) desc, s.position limit 1);

-- A new car starts at the stage matching its status (normally the first one, "Arrived");
-- a car given a stage takes that stage's status.
create or replace function public.vehicles_stage_default()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.stages;
begin
  if new.stage_id is null then
    select * into s from public.stages where company_id = new.company_id
      order by (status = new.status) desc, position limit 1;
    new.stage_id := s.id;
  elsif tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    select * into s from public.stages where id = new.stage_id;
    new.status := s.status;
  end if;
  return new;
end $$;
-- Named so it runs after vehicles_set_company (triggers fire in name order).
create trigger vehicles_stage_default before insert or update of stage_id on public.vehicles
  for each row execute function public.vehicles_stage_default();

-- 3. Journey: every stage move is a vehicle event that keeps the stage's name at the time.
alter table public.vehicle_events
  add column stage_id uuid references public.stages (id) on delete set null,
  add column stage_name text;
create index if not exists vehicle_events_stage_time_idx on public.vehicle_events (vehicle_id, event_at desc);

create or replace function public.log_vehicle_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(current_setting('app.status_note', true), '');
  v_at   timestamptz := coalesce(nullif(current_setting('app.status_at', true), '')::timestamptz, now());
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_events (company_id, vehicle_id, event_type, to_status, event_at, description, created_by)
    values (new.company_id, new.id, 'registered', new.status, coalesce(new.arrival_at, now()), 'Vehicle registered', auth.uid());
    insert into public.vehicle_events (company_id, vehicle_id, event_type, to_status, stage_id, stage_name, event_at, description, created_by)
    select new.company_id, new.id, 'stage', new.status, s.id, s.name_en, coalesce(new.arrival_at, now()), v_note, auth.uid()
    from public.stages s where s.id = new.stage_id;
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

-- Existing cars: an "arrived" entry, and their current stage if it's a later one.
insert into public.vehicle_events (company_id, vehicle_id, event_type, to_status, stage_id, stage_name, event_at, description, created_by)
select v.company_id, v.id, 'stage', 'in_stock', s.id, s.name_en, coalesce(v.arrival_at, v.created_at), null, v.created_by
from public.vehicles v
join lateral (select * from public.stages where company_id = v.company_id order by position limit 1) s on true;
insert into public.vehicle_events (company_id, vehicle_id, event_type, to_status, stage_id, stage_name, event_at, description, created_by)
select v.company_id, v.id, 'stage', v.status, s.id, s.name_en,
  case v.status when 'sold' then coalesce(v.sold_at, v.updated_at) when 'delivered' then coalesce(v.delivered_at, v.updated_at) else v.updated_at end,
  null, v.created_by
from public.vehicles v join public.stages s on s.id = v.stage_id
where s.position > (select min(position) from public.stages where company_id = v.company_id);

-- Move a car to any stage (forward, back or skipping), dated, with an optional note.
-- Sold and delivered need their date.
create or replace function public.move_vehicle_stage(
  p_vehicle_id uuid,
  p_stage_id uuid,
  p_event_at timestamptz default null,
  p_note text default null
) returns public.vehicles language plpgsql set search_path = '' as $$
declare
  s  public.stages;
  v  public.vehicles;
  at timestamptz := coalesce(p_event_at, now());
begin
  select * into s from public.stages where id = p_stage_id and company_id = public.current_company_id();
  if not found then
    raise exception 'Stage not found' using errcode = 'P0002';
  end if;
  if s.status in ('sold', 'delivered') and p_event_at is null then
    raise exception '% needs its date', s.name_en using errcode = '22023';
  end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  perform set_config('app.status_at', at::text, true);
  update public.vehicles set
    stage_id = s.id,
    sold_at = case
      when s.status = 'sold' then at
      when s.status in ('in_stock', 'in_garage', 'reserved') then null
      else coalesce(sold_at, at) end,
    delivered_at = case when s.status = 'delivered' then at else null end
  where id = p_vehicle_id
  returning * into v;
  if v.id is null then
    raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
  end if;
  insert into public.vehicle_events (vehicle_id, event_type, to_status, stage_id, stage_name, event_at, description)
  values (v.id, 'stage', s.status, s.id, s.name_en, at, nullif(btrim(coalesce(p_note, '')), ''));
  return v;
end $$;
grant execute on function public.move_vehicle_stage(uuid, uuid, timestamptz, text) to authenticated;

-- 4. Accessories: the quantity decides Present (1 or more) or Missing (0).
--    No quantity yet = not checked.
update public.accessories set quantity = 0 where status = 'missing';
update public.accessories set quantity = null where status = 'unknown';
alter table public.accessories alter column quantity drop default, alter column quantity drop not null;
alter table public.accessories drop constraint if exists accessories_quantity_check;
alter table public.accessories add constraint accessories_quantity_check check (quantity is null or quantity between 0 and 99);
create or replace function public.accessories_status_from_quantity()
returns trigger language plpgsql as $$
begin
  if new.quantity is not null then
    new.status := case when new.quantity > 0 then 'present'::public.item_status else 'missing'::public.item_status end;
  end if;
  return new;
end $$;
create trigger accessories_status_from_quantity before insert or update on public.accessories
  for each row execute function public.accessories_status_from_quantity();

-- 5. Photos: an order and one cover per car.
alter table public.vehicle_images
  add column sort_order integer,
  add column is_cover boolean not null default false;
create unique index vehicle_images_one_cover on public.vehicle_images (vehicle_id) where is_cover and deleted_at is null;

create or replace function public.set_cover_image(p_image_id uuid)
returns void language plpgsql set search_path = '' as $$
declare vid uuid;
begin
  select vehicle_id into vid from public.vehicle_images where id = p_image_id and deleted_at is null;
  if vid is null then
    raise exception 'Photo not found' using errcode = 'P0002';
  end if;
  update public.vehicle_images set is_cover = false where vehicle_id = vid and is_cover and id <> p_image_id;
  update public.vehicle_images set is_cover = true where id = p_image_id;
end $$;
grant execute on function public.set_cover_image(uuid) to authenticated;

create or replace function public.reorder_images(p_vehicle_id uuid, p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
begin
  update public.vehicle_images i set sort_order = x.n
  from unnest(p_ids) with ordinality as x(id, n)
  where i.id = x.id and i.vehicle_id = p_vehicle_id;
end $$;
grant execute on function public.reorder_images(uuid, uuid[]) to authenticated;

-- 6. The list and car pages: stage, labels, photo count, cover (star first).
create or replace view public.vehicle_overview with (security_invoker = true) as
select v.id, v.company_id, v.chassis_number, v.chassis_normalized, v.chassis_verified, v.brand, v.model, v.year,
  v.trim_level, v.exterior_color, v.interior_color, v.mileage_km, v.location, v.status, v.arrival_at, v.sold_at,
  v.delivered_at, v.acquisition_price, v.sale_price, v.notes, v.archived_at, v.created_at, v.updated_at, v.created_by,
  v.listing_price, v.doc_settings,
  coalesce(e.total, 0)::numeric(12,2) as expense_total,
  coalesce(a.missing, 0) as missing_accessories,
  coalesce(a.unknown, 0) as unknown_accessories,
  coalesce(a.total, 0) as accessory_count,
  coalesce(d.cnt, 0) as document_count,
  cover.thumbnail_path as cover_thumbnail_path,
  v.stage_id, v.labels,
  st.name_en as stage_name, st.name_ar as stage_name_ar, st.color as stage_color, st.position as stage_position,
  coalesce(p.cnt, 0) as photo_count,
  a.missing_names
from public.vehicles v
left join public.stages st on st.id = v.stage_id
left join lateral (select sum(amount) as total from public.expenses where vehicle_id = v.id and deleted_at is null) e on true
left join lateral (
  select count(*) filter (where status = 'missing') as missing,
         count(*) filter (where status = 'unknown') as unknown,
         count(*) as total,
         array_agg(item_name order by created_at) filter (where status = 'missing') as missing_names
  from public.accessories where vehicle_id = v.id) a on true
left join lateral (select count(*) as cnt from public.documents where vehicle_id = v.id and deleted_at is null and superseded_at is null) d on true
left join lateral (select count(*) as cnt from public.vehicle_images where vehicle_id = v.id and deleted_at is null and superseded_at is null and image_type <> 'information_card') p on true
left join lateral (
  select coalesce(thumbnail_path, storage_path) as thumbnail_path from public.vehicle_images
  where vehicle_id = v.id and deleted_at is null and superseded_at is null
  order by is_cover desc, sort_order nulls last,
    case image_type when 'current' then 0 when 'arrival' then 1 when 'information_card' then 2 else 3 end,
    uploaded_at desc
  limit 1) cover on true;

-- 7. Field edits are an admin's log; the journey is for everyone.
drop policy audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (company_id = public.current_company_id() and public.is_admin());

-- 8. Realtime: a change on one device shows on the others (RLS still applies).
do $$
declare t text;
begin
  foreach t in array array['vehicles', 'vehicle_specs', 'vehicle_images', 'accessories', 'expenses', 'vehicle_events', 'documents', 'stages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
