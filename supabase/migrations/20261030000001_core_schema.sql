-- Core schema for the showroom inventory system.
--
-- Design rules:
--   * The chassis number is the identity of a vehicle. Unique per company,
--     compared on a normalised form (upper case, separators removed).
--   * Every business row carries company_id. Every vehicle-related row also
--     carries vehicle_id, and a composite FK (vehicle_id, company_id) makes it
--     impossible to attach a row to another company's vehicle.
--   * Nothing important is hard-deleted by the app: vehicles are archived,
--     documents/images/expenses are soft-deleted, replaced files are superseded.
--   * Money is numeric(12,2). Timestamps are timestamptz (displayed in Asia/Dubai).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'secretary', 'staff', 'viewer');
create type public.vehicle_status as enum ('in_stock', 'in_garage', 'reserved', 'sold', 'delivered');
create type public.document_type as enum ('vehicle_pdf', 'registration', 'inspection', 'purchase', 'other');
create type public.image_type as enum ('arrival', 'current', 'garage', 'information_card', 'other');
create type public.accessory_type as enum ('physical_key', 'smart_key', 'nfc_card', 'charger', 'other');
create type public.item_status as enum ('present', 'missing', 'unknown');
create type public.expense_category as enum (
  'mechanical', 'electrical', 'bodywork', 'paint', 'tires',
  'maintenance', 'transportation', 'accessories', 'other'
);
create type public.verification_status as enum ('unverified', 'verified');
create type public.job_status as enum ('pending', 'processing', 'needs_review', 'verified', 'failed');

-- ---------------------------------------------------------------------------
-- Tenancy and staff
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  currency    text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  timezone    text not null default 'Asia/Dubai',
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  company_id  uuid not null references public.companies (id),
  full_name   text not null default '',
  role        public.app_role not null default 'viewer',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index profiles_company_idx on public.profiles (company_id);

-- Helpers used by RLS. SECURITY DEFINER so they can read profiles without
-- recursing into profiles' own policies.
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select company_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin', 'secretary', 'staff'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

-- Auth users get a profile only when an admin (service role) set company_id
-- in app_metadata, which end users cannot write. GoTrue may set app_metadata
-- in a second write after the insert, so this also runs on update. An
-- existing profile is never changed here (roles are managed in the app).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_app_meta_data ? 'company_id' then
    insert into public.profiles (id, company_id, full_name, role)
    values (
      new.id,
      (new.raw_app_meta_data ->> 'company_id')::uuid,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'viewer')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
create or replace function public.normalize_chassis(raw text)
returns text language sql immutable parallel safe as $$
  select upper(regexp_replace(coalesce(raw, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create table public.vehicles (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null default public.current_company_id() references public.companies (id),
  chassis_number      text not null check (length(trim(chassis_number)) > 0),
  chassis_normalized  text generated always as (public.normalize_chassis(chassis_number)) stored,
  chassis_verified    boolean not null default false,
  brand               text,
  model               text,
  year                int check (year between 1900 and 2100),
  trim_level          text,
  exterior_color      text,
  interior_color      text,
  mileage_km          int check (mileage_km >= 0),
  location            text,
  status              public.vehicle_status not null default 'in_stock',
  arrival_at          timestamptz,
  sold_at             timestamptz,
  delivered_at        timestamptz,
  acquisition_price   numeric(12, 2) check (acquisition_price >= 0),
  sale_price          numeric(12, 2) check (sale_price >= 0),
  notes               text,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) default auth.uid(),
  constraint vehicles_chassis_len check (length(public.normalize_chassis(chassis_number)) between 5 and 30),
  constraint vehicles_sold_has_date check (status not in ('sold', 'delivered') or sold_at is not null),
  constraint vehicles_delivered_has_date check (status <> 'delivered' or delivered_at is not null),
  -- Archived vehicles keep their chassis: a duplicate must be resolved explicitly.
  constraint vehicles_company_chassis_key unique (company_id, chassis_normalized),
  constraint vehicles_id_company_key unique (id, company_id)
);
create index vehicles_company_status_idx on public.vehicles (company_id, status);
create index vehicles_company_created_idx on public.vehicles (company_id, created_at desc);
create index vehicles_chassis_trgm_idx on public.vehicles using gin (chassis_normalized extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Documents (versioned: a replacement is a new row in the same group)
-- ---------------------------------------------------------------------------
create table public.documents (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null default public.current_company_id(),
  vehicle_id           uuid not null,
  group_id             uuid not null default gen_random_uuid(),
  version              int not null default 1 check (version >= 1),
  document_type        public.document_type not null default 'other',
  original_filename    text not null,
  storage_path         text not null unique,
  mime_type            text not null,
  file_size            bigint not null check (file_size > 0),
  notes                text,
  extracted_text       text,
  verification_status  public.verification_status not null default 'unverified',
  superseded_at        timestamptz,
  deleted_at           timestamptz,
  uploaded_by          uuid references auth.users (id) default auth.uid(),
  uploaded_at          timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id),
  unique (group_id, version)
);
create index documents_vehicle_idx on public.documents (vehicle_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Images (information_card is versioned the same way as documents)
-- ---------------------------------------------------------------------------
create table public.vehicle_images (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null default public.current_company_id(),
  vehicle_id         uuid not null,
  image_type         public.image_type not null,
  storage_path       text not null unique,
  thumbnail_path     text,
  original_filename  text not null,
  mime_type          text not null,
  file_size          bigint not null check (file_size > 0),
  caption            text,
  captured_at        timestamptz,
  superseded_at      timestamptz,
  deleted_at         timestamptz,
  uploaded_by        uuid references auth.users (id) default auth.uid(),
  uploaded_at        timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, image_type) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Accessories: one row per physical item (key 1, key 2, NFC card 1, ...)
-- ---------------------------------------------------------------------------
create table public.accessories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id(),
  vehicle_id  uuid not null,
  item_type   public.accessory_type not null,
  item_name   text not null check (length(trim(item_name)) > 0),
  quantity    int not null default 1 check (quantity >= 0),
  status      public.item_status not null default 'unknown',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index accessories_vehicle_idx on public.accessories (vehicle_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null default public.current_company_id(),
  vehicle_id            uuid not null,
  title                 text not null check (length(trim(title)) > 0),
  category              public.expense_category not null default 'other',
  amount                numeric(12, 2) not null check (amount >= 0),
  currency              text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  expense_date          date not null default (now() at time zone 'Asia/Dubai')::date,
  supplier_name         text,
  description           text,
  receipt_storage_path  text,
  deleted_at            timestamptz,
  created_by            uuid references auth.users (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index expenses_vehicle_idx on public.expenses (vehicle_id) where deleted_at is null;
create index expenses_company_date_idx on public.expenses (company_id, expense_date desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Timeline and audit
-- ---------------------------------------------------------------------------
create table public.vehicle_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default public.current_company_id(),
  vehicle_id   uuid not null,
  event_type   text not null,
  from_status  public.vehicle_status,
  to_status    public.vehicle_status,
  event_at     timestamptz not null default now(),
  description  text,
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id)
);
create index vehicle_events_vehicle_idx on public.vehicle_events (vehicle_id, event_at desc);

create table public.audit_logs (
  id               bigint generated always as identity primary key,
  company_id       uuid not null,
  user_id          uuid,
  entity_type      text not null,
  entity_id        uuid not null,
  vehicle_id       uuid,
  action           text not null,
  previous_values  jsonb,
  new_values       jsonb,
  created_at       timestamptz not null default now()
);
create index audit_logs_company_idx on public.audit_logs (company_id, created_at desc);
create index audit_logs_vehicle_idx on public.audit_logs (vehicle_id, created_at desc);

-- Reserved for the document-extraction pipeline (client-side text layer now,
-- optional Docling worker later).
create table public.document_jobs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default public.current_company_id() references public.companies (id),
  document_id       uuid references public.documents (id),
  status            public.job_status not null default 'pending',
  method            text,
  processing_error  text,
  extracted_data    jsonb,
  corrections       jsonb,
  created_by        uuid references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index document_jobs_company_idx on public.document_jobs (company_id, status);
