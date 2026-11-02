-- Permanent delete (admins only): the car, every row of it, and the list of its files.
begin;
select plan(11);

insert into public.companies (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Showroom A'), ('22222222-2222-2222-2222-222222222222', 'Showroom B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"admin"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'sec-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"secretary"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin-b@test.local', '{"company_id":"22222222-2222-2222-2222-222222222222","role":"admin"}');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');

-- A car with a bit of everything, and a second car that must not be touched.
insert into public.vehicles (id, chassis_number, brand, model) values
  ('a0000000-0000-0000-0000-000000000001', 'DELAAAAAAAAA12345', 'Nimbus', 'Arc'),
  ('a0000000-0000-0000-0000-000000000002', 'KEEPBBBBBBBB67890', 'Nimbus', 'Arc');
insert into public.vehicle_specs (vehicle_id, field_key, label, value_en) values
  ('a0000000-0000-0000-0000-000000000001', 'engine', 'Engine', '1.5L'), ('a0000000-0000-0000-0000-000000000002', 'engine', 'Engine', '2.0L');
insert into public.accessories (vehicle_id, item_type, item_name, status) values ('a0000000-0000-0000-0000-000000000001', 'physical_key', 'Key 1', 'present');
insert into public.expenses (vehicle_id, title, amount, receipt_storage_path) values
  ('a0000000-0000-0000-0000-000000000001', 'RTA', 500, '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/receipts/r.jpg');
reset role;
insert into public.vehicle_images (company_id, vehicle_id, image_type, storage_path, thumbnail_path, original_filename, mime_type, file_size) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'arrival',
   '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/photos/p.jpg',
   '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/photos/p.thumb.webp', 'p.jpg', 'image/jpeg', 1),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'current',
   '11111111-1111-1111-1111-111111111111/imports/s1/q.jpg', null, 'q.jpg', 'image/jpeg', 1);
insert into public.documents (company_id, vehicle_id, document_type, original_filename, storage_path, mime_type, file_size) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'other', 'b.pdf',
   '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/documents/b.pdf', 'application/pdf', 1);

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
select throws_ok($$ select public.delete_vehicle_permanently('a0000000-0000-0000-0000-000000000001', '12345') $$, '42501', null, 'a secretary cannot delete permanently');

select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000001');
select throws_ok($$ select public.delete_vehicle_permanently('a0000000-0000-0000-0000-000000000001', 'A12345') $$, 'P0002', null, 'another company''s admin cannot see the car');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select public.delete_vehicle_permanently('a0000000-0000-0000-0000-000000000001', '67890') $$, '22023', null, 'the wrong confirmation is refused');

create temp table r as select public.delete_vehicle_permanently('a0000000-0000-0000-0000-000000000001', ' a12345 ') as paths;
select is((select count(*)::int from public.vehicles where id = 'a0000000-0000-0000-0000-000000000001'), 0, 'the car is gone (confirmation is case- and space-insensitive)');
select is((select count(*)::int from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000001')
        + (select count(*)::int from public.accessories where vehicle_id = 'a0000000-0000-0000-0000-000000000001')
        + (select count(*)::int from public.expenses where vehicle_id = 'a0000000-0000-0000-0000-000000000001')
        + (select count(*)::int from public.vehicle_events where vehicle_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'its specs, accessories, expenses and events are gone');
reset role;
select is((select count(*)::int from public.vehicle_images where vehicle_id = 'a0000000-0000-0000-0000-000000000001')
        + (select count(*)::int from public.documents where vehicle_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'its photos and documents are gone');
select is((select array_agg(p order by p) from r, unnest(paths) p), array[
  '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/documents/b.pdf',
  '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/photos/p.jpg',
  '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/photos/p.thumb.webp',
  '11111111-1111-1111-1111-111111111111/a0000000-0000-0000-0000-000000000001/receipts/r.jpg',
  '11111111-1111-1111-1111-111111111111/imports/s1/q.jpg'], 'returns every file of the car for removal, photos, thumbnails, documents and receipts');
select is((select count(*)::int from public.vehicles where id = 'a0000000-0000-0000-0000-000000000002'), 1, 'the other car is untouched');
select is((select count(*)::int from public.vehicle_specs where vehicle_id = 'a0000000-0000-0000-0000-000000000002'), 1, 'and so are its specs');
select ok(exists (select 1 from public.audit_logs where entity_type = 'vehicles' and action ilike 'delete%'
  and entity_id = 'a0000000-0000-0000-0000-000000000001' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  and previous_values ->> 'chassis_number' = 'DELAAAAAAAAA12345'), 'the audit log records who deleted which chassis');
select hasnt_column('public', 'vehicle_specs', 'copied_from_vehicle_id', 'the copy-from-previous-car marker is gone');

select * from finish();
rollback;
