-- The checks that would hurt most if they broke:
-- duplicate chassis, tenant isolation, private files, expense totals,
-- permissions, and status/date integrity.
begin;
select plan(27);

-- Fixtures --------------------------------------------------------------------
insert into public.companies (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Showroom A'),
  ('22222222-2222-2222-2222-222222222222', 'Showroom B');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sec-a@test.local',
   '{"company_id":"11111111-1111-1111-1111-111111111111","role":"secretary"}', '{"full_name":"Secretary A"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'viewer-a@test.local',
   '{"company_id":"11111111-1111-1111-1111-111111111111","role":"viewer"}', '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'sec-b@test.local',
   '{"company_id":"22222222-2222-2222-2222-222222222222","role":"secretary"}', '{}'),
  ('cccccccc-0000-0000-0000-000000000001', 'stranger@test.local', '{}', '{}');

select is((select count(*)::int from public.profiles where id::text ~ '^(aaaaaaaa|bbbbbbbb|cccccccc)-'), 3, 'profiles only created for users given a company by an admin');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Company A secretary creates vehicles ------------------------------------------
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok($$ insert into public.vehicles (id, chassis_number, brand, model)
  values ('a0000000-0000-0000-0000-00000000000a', 'LVVDB21B9PD012345', 'Zeekr', '001') $$,
  'secretary can create a vehicle');

select is((select company_id from public.vehicles where id = 'a0000000-0000-0000-0000-00000000000a'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'company_id is filled from the session');

select throws_ok($$ insert into public.vehicles (chassis_number) values ('LVVDB21B9PD012345') $$,
  '23505', null, 'exact duplicate chassis is rejected');
select throws_ok($$ insert into public.vehicles (chassis_number) values ('lvv-db21b9 pd012345') $$,
  '23505', null, 'duplicate chassis with different case/separators is rejected');

select throws_ok($$ insert into public.vehicles (chassis_number, company_id)
  values ('WVWZZZ1KZAW000001', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'cannot create a vehicle in another company');

select is((select count(*)::int from public.vehicle_events
           where vehicle_id = 'a0000000-0000-0000-0000-00000000000a' and event_type = 'registered'),
  1, 'registration event recorded automatically');

-- Expenses: decimal-safe totals
insert into public.expenses (vehicle_id, title, category, amount) values
  ('a0000000-0000-0000-0000-00000000000a', 'Garage repair', 'mechanical', 1200.10),
  ('a0000000-0000-0000-0000-00000000000a', 'Tires', 'tires', 850.20),
  ('a0000000-0000-0000-0000-00000000000a', 'Transport', 'transportation', 0.10),
  ('a0000000-0000-0000-0000-00000000000a', 'Wrong entry', 'other', 999.99);
update public.expenses set deleted_at = now() where title = 'Wrong entry';

select is((select expense_total from public.vehicle_overview where id = 'a0000000-0000-0000-0000-00000000000a'),
  2050.40::numeric, 'expense total is exact and ignores soft-deleted expenses');
select is(((public.dashboard_stats()) ->> 'expense_total')::numeric, 2050.40::numeric, 'dashboard expense total matches');
select throws_ok($$ insert into public.expenses (vehicle_id, title, amount)
  values ('a0000000-0000-0000-0000-00000000000a', 'Negative', -5) $$, '23514', null, 'negative expense rejected');
delete from public.expenses where title = 'Tires'; -- no delete policy: affects 0 rows
select is((select count(*)::int from public.expenses where title = 'Tires'), 1, 'expenses cannot be hard-deleted');

-- Status lifecycle
select throws_ok($$ update public.vehicles set status = 'sold' where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'cannot mark sold without a sale date');
select lives_ok($$ select public.change_vehicle_status('a0000000-0000-0000-0000-00000000000a', 'sold',
  '2026-10-01 15:30+04', 'Sold to walk-in customer') $$, 'change_vehicle_status marks sold');
select is((select sold_at from public.vehicles where id = 'a0000000-0000-0000-0000-00000000000a'),
  '2026-10-01 11:30+00'::timestamptz, 'sale date/time stored exactly');
select is((select description from public.vehicle_events
           where vehicle_id = 'a0000000-0000-0000-0000-00000000000a' and event_type = 'status_change'),
  'Sold to walk-in customer', 'status change event keeps the note');
select ok(exists(select 1 from public.audit_logs where entity_id = 'a0000000-0000-0000-0000-00000000000a' and action = 'update'),
  'status change is in the audit log');

-- Storage: own company path allowed, other company path refused
select lives_ok($$ insert into storage.objects (bucket_id, name, owner)
  values ('vehicle-files', '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-00000000000a/documents/x.pdf',
          'aaaaaaaa-0000-0000-0000-000000000001') $$, 'can upload under own company/vehicle');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
  values ('vehicle-files', '22222222-2222-2222-2222-222222222222/a0000000-0000-0000-0000-00000000000a/documents/y.pdf',
          'aaaaaaaa-0000-0000-0000-000000000001') $$, '42501', null, 'cannot upload into another company folder');

-- Viewer is read-only ------------------------------------------------------------
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
select is((select count(*)::int from public.vehicles), 1, 'viewer can read company vehicles');
select throws_ok($$ insert into public.vehicles (chassis_number) values ('JTMHV05J604123456') $$,
  '42501', null, 'viewer cannot create vehicles');
update public.vehicles set brand = 'Hacked';
select pg_temp.logout();
select is((select brand from public.vehicles where id = 'a0000000-0000-0000-0000-00000000000a'), 'Zeekr',
  'viewer update has no effect');

-- Company B sees nothing of company A ---------------------------------------------
select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000001');
select is((select count(*)::int from public.vehicles), 0, 'company B cannot see company A vehicles');
select is((select count(*)::int from public.expenses), 0, 'company B cannot see company A expenses');
select is((select count(*)::int from storage.objects where bucket_id = 'vehicle-files'), 0,
  'company B cannot see company A files');
select lives_ok($$ insert into public.vehicles (chassis_number) values ('LVVDB21B9PD012345') $$,
  'same chassis may exist in a different company');
select throws_ok($$ insert into public.expenses (vehicle_id, title, amount, company_id)
  values ('a0000000-0000-0000-0000-00000000000a', 'x', 1, '22222222-2222-2222-2222-222222222222') $$,
  '23503', null, 'cannot attach an expense to another company''s vehicle');

-- A user with no company sees nothing ---------------------------------------------
select pg_temp.login('cccccccc-0000-0000-0000-000000000001');
select is((select count(*)::int from public.vehicles), 0, 'user without a profile sees nothing');

select * from finish();
rollback;
