-- "Copy from a previous car": exactly what is and isn't copied.
begin;
select plan(16);

insert into public.companies (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Showroom A'), ('22222222-2222-2222-2222-222222222222', 'Showroom B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sec-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"secretary"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'viewer-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"viewer"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'sec-b@test.local', '{"company_id":"22222222-2222-2222-2222-222222222222","role":"secretary"}');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');

-- Source: an earlier (sold, archived) car with specs, lists, other info, price, photo, expense, accessory.
insert into public.vehicles (id, chassis_number, brand, model, year, trim_level, listing_price, status, sold_at, arrival_at, mileage_km)
values ('a0000000-0000-0000-0000-000000000001', 'SRCAAAAAAAAAAAAA1', 'Nimbus', 'Arc', 2030, 'Long Range', 150000, 'sold', '2031-01-01', '2030-12-01', 9000);
update public.vehicles set archived_at = now() where id = 'a0000000-0000-0000-0000-000000000001';
insert into public.vehicle_specs (vehicle_id, field_key, label, value_en, value_ar) values
  ('a0000000-0000-0000-0000-000000000001', 'engine', 'Engine', '1.5L range extender', 'محرك 1.5 لتر'),
  ('a0000000-0000-0000-0000-000000000001', 'top_speed', 'Top Speed', '200 km/h', '200 كم/ساعة'),
  ('a0000000-0000-0000-0000-000000000001', 'description', 'Description', 'Family SUV', null);
insert into public.vehicle_specs (vehicle_id, field_key, position, label, value_en, value_ar) values
  ('a0000000-0000-0000-0000-000000000001', 'smart_features', 1, 'SMART DRIVING', 'Lane Keeping Assist', 'مساعد البقاء في المسار'),
  ('a0000000-0000-0000-0000-000000000001', 'smart_features', 2, 'SMART DRIVING', 'Night Vision', 'رؤية ليلية'),
  ('a0000000-0000-0000-0000-000000000001', 'key_features', 1, 'KEY FEATURES', 'Panoramic roof', null),
  ('a0000000-0000-0000-0000-000000000001', 'drive_modes', 1, 'DRIVE MODES', 'Eco', 'اقتصادي');
insert into public.vehicle_specs (vehicle_id, label, value_en) values ('a0000000-0000-0000-0000-000000000001', 'Warranty', '5 years');
insert into public.accessories (vehicle_id, item_type, item_name, status) values ('a0000000-0000-0000-0000-000000000001', 'physical_key', 'Key 1', 'present');
insert into public.expenses (vehicle_id, title, amount) values ('a0000000-0000-0000-0000-000000000001', 'Tint', 500);

-- Target: a new car of the same model; top speed and drive modes already filled.
insert into public.vehicles (id, chassis_number, brand, model, year)
values ('a0000000-0000-0000-0000-000000000002', 'TGTBBBBBBBBBBBBB2', 'Nimbus', 'Arc', 2031);
insert into public.vehicle_specs (vehicle_id, field_key, label, value_en) values ('a0000000-0000-0000-0000-000000000002', 'top_speed', 'Top Speed', '205 km/h');
insert into public.vehicle_specs (vehicle_id, field_key, position, label, value_en) values ('a0000000-0000-0000-0000-000000000002', 'drive_modes', 1, 'DRIVE MODES', 'Sport');

create temp table r as select public.copy_specs_from('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001') as res;

select is((select res from r), '{"fields": 2, "items": 3, "kept": 1}'::jsonb, 'copies 2 empty fields and 3 list items; keeps 1 filled field');
select is((select value_en || ' / ' || value_ar from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'engine'),
  '1.5L range extender / محرك 1.5 لتر', 'English and Arabic values are copied');
select is((select value_en from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'top_speed'),
  '205 km/h', 'an already-filled field is never overwritten');
select is((select string_agg(value_en, ',' order by position) from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'smart_features'),
  'Lane Keeping Assist,Night Vision', 'lists are copied in order');
select is((select count(*)::int from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'key_features'), 1, 'key features are copied');
select is((select string_agg(value_en, ',') from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'drive_modes'),
  'Sport', 'a list the target already has is left alone');
select is((select count(*)::int from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key is null), 0, '"Other" information is not copied');
select ok((select bool_and(copied_from_vehicle_id = 'a0000000-0000-0000-0000-000000000001') from public.vehicle_specs
  where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key in ('engine', 'description', 'smart_features', 'key_features')), 'copied rows are marked with their source');
select is((select count(*)::int from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'top_speed' and copied_from_vehicle_id is not null), 0, 'kept fields are not marked');

select is((select row(chassis_number, listing_price, status::text, sold_at, arrival_at, mileage_km, archived_at, trim_level)::text from public.vehicles where id = 'a0000000-0000-0000-0000-000000000002'),
  row('TGTBBBBBBBBBBBBB2', null::numeric, 'in_stock', null::timestamptz, null::timestamptz, null::int, null::timestamptz, null::text)::text,
  'chassis, price, status, dates, mileage and archive state are not copied');
select is((select count(*)::int from public.accessories where vehicle_id = 'a0000000-0000-0000-0000-000000000002'), 0, 'accessories are not copied');
select is((select count(*)::int from public.expenses where vehicle_id = 'a0000000-0000-0000-0000-000000000002'), 0, 'expenses are not copied');
select is((select count(*)::int from public.vehicle_images where vehicle_id = 'a0000000-0000-0000-0000-000000000002'), 0, 'photos are not copied');

update public.vehicle_specs set value_en = '1.5L turbo range extender' where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'engine';
select is((select copied_from_vehicle_id from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002' and field_key = 'engine'), null::uuid,
  'changing a copied value clears its "copied from" mark');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
select throws_ok($$ select public.copy_specs_from('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001') $$, '42501', null, 'read-only users cannot copy');

select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000001');
insert into public.vehicles (id, chassis_number) values ('b0000000-0000-0000-0000-000000000001', 'OTHERCOMPANYCAR01');
select throws_ok($$ select public.copy_specs_from('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001') $$, 'P0002', null, 'cannot copy from another company''s car');

select * from finish();
rollback;
