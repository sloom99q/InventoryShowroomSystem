-- After-Sales (rebuild-v3/AFTERSALES.md): customers and owners, warranty, service, parts,
-- offers, WhatsApp message log and the handover check.
--
-- Who can do what:
--   admin, sales_manager  everything
--   secretary             reads everything (her inventory access is unchanged)
--   technician            logs services, requests and moves parts; never sees phone
--                         numbers or prices (reads through views without them; writes
--                         through functions that check the role)

-- 1. Roles -------------------------------------------------------------------------
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin', 'secretary', 'staff', 'sales_manager'), false)
$$;
create or replace function public.is_aftersales_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin', 'sales_manager'), false)
$$;
create or replace function public.can_see_customers()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin', 'sales_manager', 'secretary'), false)
$$;
create or replace function public.can_service()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin', 'sales_manager', 'technician'), false)
$$;

-- 2. Tables --------------------------------------------------------------------------
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) > 0),
  phone      text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  email      text,
  id_number  text,
  emirate    text,
  language   text not null default 'ar' check (language in ('ar', 'en')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create index customers_company_idx on public.customers (company_id, full_name);
create index customers_phone_idx on public.customers (company_id, phone);

create table public.vehicle_owners (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id  uuid not null,
  customer_id uuid not null,
  from_date   date not null default (now() at time zone 'Asia/Dubai')::date,
  to_date     date,
  sold_by     uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id),
  foreign key (customer_id, company_id) references public.customers (id, company_id)
);
-- One current owner per car (the open row).
create unique index vehicle_owners_current on public.vehicle_owners (vehicle_id) where to_date is null;

create table public.warranty_defaults (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  brand      text,          -- null = every brand without its own row
  kind       text not null check (kind in ('vehicle', 'battery', 'extended')),
  years      integer not null check (years between 0 and 20),
  km         integer check (km is null or km > 0),
  terms      text,
  created_at timestamptz not null default now()
);
create unique index warranty_defaults_one on public.warranty_defaults (company_id, lower(coalesce(brand, '')), kind);

create table public.warranties (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id uuid not null,
  kind       text not null check (kind in ('vehicle', 'battery', 'extended')),
  start_date date not null,
  years      integer not null check (years between 0 and 20),
  km         integer check (km is null or km > 0),
  terms      text,
  created_at timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index warranties_vehicle_idx on public.warranties (vehicle_id);

create table public.service_plans (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  brand      text,          -- null = every brand without its own row
  months     integer not null check (months between 1 and 60),
  km         integer not null check (km between 500 and 100000),
  created_at timestamptz not null default now()
);
create unique index service_plans_one on public.service_plans (company_id, lower(coalesce(brand, '')));

create table public.service_visits (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id    uuid not null,
  visit_date    date not null default (now() at time zone 'Asia/Dubai')::date,
  odometer_km   integer check (odometer_km is null or odometer_km >= 0),
  title         text not null default 'Service',
  work_done     text,
  technician_id uuid references auth.users (id) default auth.uid(),
  cost          numeric(12,2) not null default 0 check (cost >= 0),
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index service_visits_vehicle_idx on public.service_visits (vehicle_id, visit_date desc);

create table public.part_requests (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id       uuid not null,
  service_visit_id uuid references public.service_visits (id) on delete set null,
  name             text not null check (length(btrim(name)) > 0),
  part_no          text,
  qty              integer not null default 1 check (qty between 1 and 999),
  supplier         text,
  cost             numeric(12,2) check (cost is null or cost >= 0),
  status           text not null default 'requested' check (status in ('requested', 'ordered', 'arrived', 'fitted', 'cancelled')),
  requested_at     timestamptz not null default now(),
  ordered_at       timestamptz,
  arrived_at       timestamptz,
  fitted_at        timestamptz,
  cancelled_at     timestamptz,
  requested_by     uuid default auth.uid(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index part_requests_vehicle_idx on public.part_requests (vehicle_id);

create table public.offer_catalogue (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  default_price numeric(12,2),
  icon          text not null default 'tag',
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

create table public.offers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id   uuid not null,
  catalogue_id uuid references public.offer_catalogue (id) on delete set null,
  name         text not null,
  icon         text not null default 'tag',
  price        numeric(12,2),
  status       text not null default 'offered' check (status in ('offered', 'accepted', 'declined')),
  offered_at   timestamptz not null default now(),
  decided_at   timestamptz,
  created_by   uuid default auth.uid(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index offers_vehicle_idx on public.offers (vehicle_id);

create table public.message_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id  uuid not null,
  customer_id uuid,
  kind        text not null check (kind in ('service', 'warranty', 'part', 'offer', 'free')),
  text        text not null,
  phone       text,
  opened_at   timestamptz not null default now(),
  opened_by   uuid default auth.uid(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index message_log_vehicle_idx on public.message_log (vehicle_id, opened_at desc);

-- Handover: who checked what went with the car, and when.
alter table public.vehicles
  add column handover_checked_at timestamptz,
  add column handover_checked_by uuid references auth.users (id);

-- The car views show the handover check too.
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
  a.missing_names,
  v.handover_checked_at, v.handover_checked_by
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

-- 3. Housekeeping triggers and RLS -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['customers', 'vehicle_owners', 'warranty_defaults', 'warranties', 'service_plans', 'service_visits', 'part_requests', 'offer_catalogue', 'offers', 'message_log'] loop
    execute format('create trigger %I_set_company before insert on public.%I for each row execute function public.set_company_id()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();

-- Customers, owners, messages: managers write; secretary reads; technicians never (phones).
create policy customers_select on public.customers for select to authenticated using (company_id = public.current_company_id() and public.can_see_customers());
create policy customers_write on public.customers for all to authenticated
  using (company_id = public.current_company_id() and public.is_aftersales_manager())
  with check (company_id = public.current_company_id() and public.is_aftersales_manager());
create policy owners_select on public.vehicle_owners for select to authenticated using (company_id = public.current_company_id() and public.can_see_customers());
create policy owners_write on public.vehicle_owners for all to authenticated
  using (company_id = public.current_company_id() and public.is_aftersales_manager())
  with check (company_id = public.current_company_id() and public.is_aftersales_manager());
create policy messages_select on public.message_log for select to authenticated using (company_id = public.current_company_id() and public.can_see_customers());
create policy messages_insert on public.message_log for insert to authenticated with check (company_id = public.current_company_id() and public.is_aftersales_manager());

-- Warranty and plans: managers write; secretary reads (technicians use the views below).
do $$
declare t text;
begin
  foreach t in array array['warranties', 'warranty_defaults', 'service_plans', 'offer_catalogue', 'offers', 'service_visits', 'part_requests'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (company_id = public.current_company_id() and public.can_see_customers())', t, t);
    execute format($p$create policy %I_write on public.%I for all to authenticated
      using (company_id = public.current_company_id() and public.is_aftersales_manager())
      with check (company_id = public.current_company_id() and public.is_aftersales_manager())$p$, t, t);
  end loop;
end $$;

-- 4. Defaults for every showroom (editable in Settings) ------------------------------------
create or replace function public.seed_aftersales_defaults(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.warranty_defaults (company_id, brand, kind, years, km, terms) values
    (p_company, null, 'vehicle', 5, 150000, 'Whichever comes first'),
    (p_company, null, 'battery', 8, 160000, 'Battery and electric motor');
  insert into public.service_plans (company_id, brand, months, km) values (p_company, null, 12, 10000);
  insert into public.offer_catalogue (company_id, name, default_price, icon, position) values
    (p_company, 'Wall charger + installation', 3200, 'plug', 1),
    (p_company, 'Extended warranty +2 years', 4500, 'shield', 2),
    (p_company, 'Full PPF', 6600, 'sparkles', 3),
    (p_company, 'Window tint', 1200, 'sun', 4),
    (p_company, 'Ceramic coating', 2500, 'droplet', 5),
    (p_company, 'Floor mats (premium)', 450, 'mats', 6),
    (p_company, 'Roof box', 1800, 'box', 7);
$$;
revoke all on function public.seed_aftersales_defaults(uuid) from public, anon, authenticated;
select public.seed_aftersales_defaults(id) from public.companies;
create or replace function public.companies_seed_aftersales()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_aftersales_defaults(new.id);
  return new;
end $$;
create trigger companies_seed_aftersales after insert on public.companies for each row execute function public.companies_seed_aftersales();

-- 5. The maths ---------------------------------------------------------------------------
-- When the car was handed over (delivered, else sold, else today).
create or replace function public.handover_date(v public.vehicles)
returns date language sql stable set search_path = '' as $$
  select coalesce((v.delivered_at at time zone 'Asia/Dubai')::date, (v.sold_at at time zone 'Asia/Dubai')::date)
$$;

-- Next service: last visit (or delivery) + the brand's plan, by date or km, whichever comes first.
create or replace function public.next_service(p_vehicle_id uuid)
returns table (due_date date, due_km integer, last_km integer, plan_months integer, plan_km integer, base_date date, status text, days_left integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v    public.vehicles;
  p    public.service_plans;
  lv   public.service_visits;
  base date;
  bkm  integer;
  odo  integer;
  today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select * into v from public.vehicles where id = p_vehicle_id and company_id = public.current_company_id();
  if not found then return; end if;
  -- The car's own brand plan, else the showroom default (brand empty). Never another brand's.
  select * into p from public.service_plans where company_id = v.company_id
    and (brand is null or lower(brand) = lower(v.brand))
    order by brand nulls last limit 1;
  if not found then return; end if;
  select * into lv from public.service_visits where vehicle_id = v.id order by visit_date desc, created_at desc limit 1;
  base := coalesce(lv.visit_date, public.handover_date(v));
  if base is null then return; end if;
  bkm := coalesce(lv.odometer_km, case when lv.id is null then v.mileage_km end, 0);
  select greatest(coalesce(max(odometer_km), 0), coalesce(v.mileage_km, 0)) into odo from public.service_visits where vehicle_id = v.id;
  due_date := (base + make_interval(months => p.months))::date;
  due_km := bkm + p.km;
  last_km := odo;
  plan_months := p.months;
  plan_km := p.km;
  base_date := base;
  days_left := due_date - today;
  status := case
    when today >= due_date or odo >= due_km then 'overdue'
    when days_left <= 30 or due_km - odo <= 1000 then 'due_soon'
    else 'ok' end;
  return next;
end $$;
grant execute on function public.next_service(uuid) to authenticated;

-- Warranty end date and status for one warranty.
create or replace function public.warranty_end(w public.warranties)
returns date language sql immutable as $$
  select (w.start_date + make_interval(years => w.years))::date
$$;

-- 6. Owner → warranty from the brand's defaults (first owner only) ---------------------------
create or replace function public.owners_fill_warranty()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.vehicles;
begin
  if exists (select 1 from public.warranties where vehicle_id = new.vehicle_id) then return new; end if;
  select * into v from public.vehicles where id = new.vehicle_id;
  insert into public.warranties (company_id, vehicle_id, kind, start_date, years, km, terms)
  select v.company_id, v.id, d.kind, coalesce(public.handover_date(v), new.from_date), d.years, d.km, d.terms
  from (
    select distinct on (kind) * from public.warranty_defaults
    where company_id = v.company_id and (brand is null or lower(brand) = lower(v.brand))
    order by kind, (brand is not null) desc
  ) d where d.kind <> 'extended';
  return new;
end $$;
create trigger vehicle_owners_fill_warranty after insert on public.vehicle_owners for each row execute function public.owners_fill_warranty();

-- 7. Technician paths (no prices, no phones) ----------------------------------------------
-- Services without the cost, parts without the cost, owners by name only.
create view public.service_visits_tech with (security_barrier = true) as
  select id, company_id, vehicle_id, visit_date, odometer_km, title, work_done, technician_id, notes, created_at
  from public.service_visits where company_id = public.current_company_id() and public.can_service();
create view public.part_requests_tech with (security_barrier = true) as
  select id, company_id, vehicle_id, service_visit_id, name, part_no, qty, supplier, status, requested_at, ordered_at, arrived_at, fitted_at, cancelled_at, requested_by
  from public.part_requests where company_id = public.current_company_id() and public.can_service();
create view public.owner_names with (security_barrier = true) as
  select o.vehicle_id, c.full_name
  from public.vehicle_owners o join public.customers c on c.id = o.customer_id
  where o.to_date is null and o.company_id = public.current_company_id()
    and coalesce(public.current_app_role() in ('admin', 'sales_manager', 'secretary', 'technician'), false);
grant select on public.service_visits_tech, public.part_requests_tech, public.owner_names to authenticated;

create or replace function public.log_service_visit(
  p_vehicle_id uuid, p_visit_date date, p_odometer_km integer, p_title text, p_work_done text default null,
  p_cost numeric default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.can_service() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and company_id = public.current_company_id()) then
    raise exception 'Vehicle not found' using errcode = 'P0002';
  end if;
  insert into public.service_visits (company_id, vehicle_id, visit_date, odometer_km, title, work_done, cost, notes, technician_id, created_by)
  values (public.current_company_id(), p_vehicle_id, coalesce(p_visit_date, (now() at time zone 'Asia/Dubai')::date), p_odometer_km,
    coalesce(nullif(btrim(p_title), ''), 'Service'), p_work_done,
    -- a technician can't set prices
    case when public.is_aftersales_manager() then coalesce(p_cost, 0) else 0 end, p_notes, auth.uid(), auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.request_part(
  p_vehicle_id uuid, p_name text, p_qty integer default 1, p_part_no text default null, p_supplier text default null,
  p_cost numeric default null, p_service_visit_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.can_service() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and company_id = public.current_company_id()) then
    raise exception 'Vehicle not found' using errcode = 'P0002';
  end if;
  insert into public.part_requests (company_id, vehicle_id, service_visit_id, name, qty, part_no, supplier, cost, requested_by)
  values (public.current_company_id(), p_vehicle_id, p_service_visit_id, btrim(p_name), coalesce(p_qty, 1), nullif(btrim(p_part_no), ''),
    nullif(btrim(p_supplier), ''), case when public.is_aftersales_manager() then p_cost end, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.set_part_status(p_part_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_service() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_status not in ('requested', 'ordered', 'arrived', 'fitted', 'cancelled') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.part_requests set
    status = p_status,
    ordered_at   = case when p_status in ('ordered', 'arrived', 'fitted') then coalesce(ordered_at, now()) when p_status = 'requested' then null else ordered_at end,
    arrived_at   = case when p_status in ('arrived', 'fitted') then coalesce(arrived_at, now()) when p_status in ('requested', 'ordered') then null else arrived_at end,
    fitted_at    = case when p_status = 'fitted' then coalesce(fitted_at, now()) when p_status <> 'cancelled' then null else fitted_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else null end
  where id = p_part_id and company_id = public.current_company_id();
  if not found then
    raise exception 'Part not found' using errcode = 'P0002';
  end if;
end $$;
grant execute on function public.log_service_visit(uuid, date, integer, text, text, numeric, text) to authenticated;
grant execute on function public.request_part(uuid, text, integer, text, text, numeric, uuid) to authenticated;
grant execute on function public.set_part_status(uuid, text) to authenticated;

-- Handover check at delivery.
create or replace function public.check_handover(p_vehicle_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  update public.vehicles set handover_checked_at = now(), handover_checked_by = auth.uid() where id = p_vehicle_id;
  if not found then
    raise exception 'Vehicle not found or not permitted' using errcode = 'P0002';
  end if;
end $$;
grant execute on function public.check_handover(uuid) to authenticated;

-- 8. Reminders: what needs a message (service due ≤ 30 days or overdue, warranty ending ≤ 60 days, parts arrived)
create or replace function public.aftersales_reminders()
returns table (kind text, vehicle_id uuid, days integer, part_id uuid, part_name text, warranty_kind text, due_date date, status text)
language sql stable security definer set search_path = '' as $$
  with cars as (
    select v.* from public.vehicles v
    where v.company_id = public.current_company_id() and v.status in ('sold', 'delivered') and v.archived_at is null
      and coalesce(public.current_app_role() in ('admin', 'sales_manager', 'secretary', 'technician'), false)
  )
  select 'service', c.id, s.days_left, null::uuid, null::text, null::text, s.due_date, s.status
  from cars c cross join lateral public.next_service(c.id) s where s.status in ('overdue', 'due_soon')
  union all
  select 'warranty', c.id, public.warranty_end(w) - (now() at time zone 'Asia/Dubai')::date, null, null, w.kind, public.warranty_end(w), 'ending'
  from cars c join public.warranties w on w.vehicle_id = c.id
  where public.warranty_end(w) - (now() at time zone 'Asia/Dubai')::date between 0 and 60
  union all
  select 'part', c.id, null, p.id, p.name, null, null, 'arrived'
  from cars c join public.part_requests p on p.vehicle_id = c.id and p.status = 'arrived'
$$;
grant execute on function public.aftersales_reminders() to authenticated;

-- 9. Permanent delete also removes the car's After-Sales records ---------------------------
create or replace function public.delete_vehicle_permanently(p_vehicle_id uuid, p_confirm text)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  company uuid := public.current_company_id();
  v       public.vehicles;
  paths   text[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a vehicle permanently' using errcode = '42501';
  end if;
  select * into v from public.vehicles where id = p_vehicle_id and company_id = company;
  if not found then
    raise exception 'Vehicle not found' using errcode = 'P0002';
  end if;
  if upper(regexp_replace(coalesce(p_confirm, ''), '\s', '', 'g')) <> upper(right(v.chassis_number, 6)) then
    raise exception 'Type the last 6 characters of the chassis number to confirm' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct p), '{}') into paths from (
    select o.name as p from storage.objects o
      where o.bucket_id = 'vehicle-files' and o.name like company::text || '/' || v.id::text || '/%'
    union select storage_path from public.vehicle_images where vehicle_id = v.id
    union select thumbnail_path from public.vehicle_images where vehicle_id = v.id and thumbnail_path is not null
    union select storage_path from public.documents where vehicle_id = v.id
    union select receipt_storage_path from public.expenses where vehicle_id = v.id and receipt_storage_path is not null
  ) x where p is not null;

  -- After-Sales records of the car (customers themselves are kept).
  delete from public.message_log where vehicle_id = v.id;
  delete from public.offers where vehicle_id = v.id;
  delete from public.part_requests where vehicle_id = v.id;
  delete from public.service_visits where vehicle_id = v.id;
  delete from public.warranties where vehicle_id = v.id;
  delete from public.vehicle_owners where vehicle_id = v.id;
  delete from public.vehicle_specs where vehicle_id = v.id;
  delete from public.vehicle_images where vehicle_id = v.id;
  delete from public.documents where vehicle_id = v.id;
  delete from public.expenses where vehicle_id = v.id;
  delete from public.accessories where vehicle_id = v.id;
  delete from public.vehicle_events where vehicle_id = v.id;
  delete from public.vehicles where id = v.id;
  return paths;
end $$;

-- 10. Realtime for the new tables ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['customers', 'vehicle_owners', 'warranties', 'service_visits', 'part_requests', 'offers', 'message_log'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
