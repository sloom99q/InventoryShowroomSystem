-- After-Sales: next service (date vs km), warranty from defaults, roles, reminders.
begin;
select plan(25);

insert into public.companies (id, name) values ('11111111-1111-1111-1111-111111111111', 'Showroom A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'mgr@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"sales_manager"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'tech@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"technician"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'sec@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"secretary"}');
create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Dubai')::date $$;

-- A Voyah delivered 340 days ago at 12 km (plan: 12 months / 10,000 km), a BYD with its own warranty defaults.
insert into public.warranty_defaults (company_id, brand, kind, years, km) values ('11111111-1111-1111-1111-111111111111', 'BYD', 'vehicle', 6, 200000);
insert into public.service_plans (company_id, brand, months, km) values ('11111111-1111-1111-1111-111111111111', 'BYD', 6, 15000);
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.vehicles (id, chassis_number, brand, model, mileage_km) values
  ('a0000000-0000-0000-0000-000000000001', 'ASVOYAH0000012345', 'VOYAH', 'FREE', 12),
  ('a0000000-0000-0000-0000-000000000002', 'ASBYDSEAL00118842', 'BYD', 'SEAL', 5);
select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', (select id from public.stages where company_id = '11111111-1111-1111-1111-111111111111' and name_en = 'Delivered'), now() - interval '340 days');
select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000002', (select id from public.stages where company_id = '11111111-1111-1111-1111-111111111111' and name_en = 'Delivered'), now() - interval '10 days');

-- Owner → warranty from defaults, starting at delivery.
insert into public.customers (id, full_name, phone, language) values
  ('c0000000-0000-0000-0000-000000000001', 'Ahmed Al Mansoori', '+971505550142', 'ar'),
  ('c0000000-0000-0000-0000-000000000002', 'Omar Haddad', '+971501112233', 'en');
insert into public.vehicle_owners (vehicle_id, customer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002');
select is((select string_agg(kind || ' ' || years || 'y/' || km, ', ' order by kind) from public.warranties where vehicle_id = 'a0000000-0000-0000-0000-000000000001'),
  'battery 8y/160000, vehicle 5y/150000', 'an owner fills the warranty from the showroom defaults');
select is((select start_date from public.warranties where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and kind = 'vehicle'), pg_temp.today() - 340, 'starting on the delivery date');
select is((select public.warranty_end(w) from public.warranties w where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and kind = 'vehicle'),
  ((pg_temp.today() - 340) + interval '5 years')::date, 'covered until delivery + 5 years');
select is((select years || 'y/' || km from public.warranties where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and kind = 'vehicle'), '6y/200000', 'a brand''s own defaults win');
select throws_ok($$ insert into public.vehicle_owners (vehicle_id, customer_id) values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002') $$, '23505', null, 'one current owner per car');

-- First service: from delivery. Date first: 12 months after delivery, due in ~25 days.
select is((select due_date from public.next_service('a0000000-0000-0000-0000-000000000001')), ((pg_temp.today() - 340) + interval '12 months')::date, 'first service due 12 months after delivery');
select is((select due_km from public.next_service('a0000000-0000-0000-0000-000000000001')), 10012, 'or at delivery km + 10,000');
select is((select status from public.next_service('a0000000-0000-0000-0000-000000000001')), 'due_soon', 'due within 30 days by date');
select is((select plan_months || '/' || plan_km from public.next_service('a0000000-0000-0000-0000-000000000002')), '6/15000', 'the brand''s own service plan');

-- Km first: the odometer passed 10,012 km before the date → overdue.
select public.log_service_visit('a0000000-0000-0000-0000-000000000002', pg_temp.today() - 2, 15020, 'Check-up', 'tyres', 0);
select is((select status from public.next_service('a0000000-0000-0000-0000-000000000002')), 'ok', 'a service moves the next due date forward');
select is((select due_km from public.next_service('a0000000-0000-0000-0000-000000000002')), 30020, 'next due km = visit km + plan km');
update public.vehicles set mileage_km = 30100 where id = 'a0000000-0000-0000-0000-000000000002';
select is((select status from public.next_service('a0000000-0000-0000-0000-000000000002')), 'overdue', 'km reached before the date: overdue (whichever comes first)');
-- Logging a service resets it.
select public.log_service_visit('a0000000-0000-0000-0000-000000000001', pg_temp.today(), 9420, 'First service', 'Software update', 350);
select is((select due_date from public.next_service('a0000000-0000-0000-0000-000000000001')), (pg_temp.today() + interval '12 months')::date, 'logging the service moves the due date 12 months on');
select is((select cost from public.service_visits where title = 'First service'), 350.00, 'a manager can set the cost');

-- Reminders.
select ok(exists (select 1 from public.aftersales_reminders() where kind = 'service' and vehicle_id = 'a0000000-0000-0000-0000-000000000002'), 'an overdue service needs a message');
select ok(not exists (select 1 from public.aftersales_reminders() where kind = 'service' and vehicle_id = 'a0000000-0000-0000-0000-000000000001'), 'a car just serviced does not');
update public.warranties set start_date = (pg_temp.today() - interval '5 years')::date + 41 where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and kind = 'vehicle';
update public.warranty_defaults set years = 6 where brand = 'BYD'; -- unrelated, defaults only apply to new owners
select is((select days from public.aftersales_reminders() where kind = 'warranty' and vehicle_id = 'a0000000-0000-0000-0000-000000000002'), null::int, 'a 6-year warranty is not ending yet');
update public.warranties set years = 5 where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and kind = 'vehicle';
select is((select days from public.aftersales_reminders() where kind = 'warranty' and vehicle_id = 'a0000000-0000-0000-0000-000000000002'), 41, 'a warranty ending in 41 days needs a message');

-- Technician: requests a part, moves it, sees no prices and no phone numbers.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
create temp table p as select public.request_part('a0000000-0000-0000-0000-000000000001', 'Front brake pads (set)', 1, 'VY-BP-2201', 'Al Futtaim Parts', 680) as id;
select public.set_part_status((select id from p), 'ordered');
select public.set_part_status((select id from p), 'arrived');
select is((select count(*)::int from public.customers), 0, 'a technician cannot read customers (phone numbers)');
select is((select count(*)::int from public.part_requests), 0, 'nor the parts table with prices');
select is((select status from public.part_requests_tech where id = (select id from p)), 'arrived', 'but works on parts through the price-free view');
select is((select full_name from public.owner_names where vehicle_id = 'a0000000-0000-0000-0000-000000000001'), 'Ahmed Al Mansoori', 'and sees the owner''s name only');
select throws_ok($$ insert into public.customers (full_name) values ('X') $$, '42501', null, 'a technician cannot add customers');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
select is((select cost from public.part_requests where id = (select id from p)), null::numeric, 'a technician''s request carries no price');
select ok(exists (select 1 from public.aftersales_reminders() where kind = 'part' and part_name = 'Front brake pads (set)'), 'an arrived part needs a message');

select * from finish();
rollback;
