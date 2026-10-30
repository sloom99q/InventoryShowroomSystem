-- Document import: single-transaction save, file ownership, spec isolation.
begin;
select plan(12);

insert into public.companies (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Showroom A'),
  ('22222222-2222-2222-2222-222222222222', 'Showroom B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sec-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"secretary"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'viewer-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"viewer"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'sec-b@test.local', '{"company_id":"22222222-2222-2222-2222-222222222222","role":"secretary"}');

-- Files already uploaded (as the client does before saving).
insert into storage.objects (bucket_id, name) values
  ('vehicle-files', '11111111-1111-1111-1111-111111111111/imports/s1/brochure.pdf'),
  ('vehicle-files', '11111111-1111-1111-1111-111111111111/imports/s1/photo.jpg'),
  ('vehicle-files', '22222222-2222-2222-2222-222222222222/imports/s9/other.pdf');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok($$ select public.save_vehicle_import(null, '{"brand":"X"}') $$, '23502', null,
  'a new vehicle needs a chassis number');

select throws_ok($$ select public.save_vehicle_import(null, '{"chassis_number":"TSTA1234567890123"}',
  '[{"key":"f1","storage_path":"22222222-2222-2222-2222-222222222222/imports/s9/other.pdf","original_filename":"o.pdf","mime_type":"application/pdf","file_size":10}]') $$,
  '42501', null, 'cannot attach another company''s file');

select throws_ok($$ select public.save_vehicle_import(null, '{"chassis_number":"TSTA1234567890123"}',
  '[{"key":"f1","storage_path":"11111111-1111-1111-1111-111111111111/imports/s1/missing.pdf","original_filename":"m.pdf","mime_type":"application/pdf","file_size":10}]') $$,
  '42501', null, 'cannot reference a file that was never uploaded');

select throws_ok($$ select public.save_vehicle_import(null, '{"chassis_number":"TSTA1234567890123","company_id":"x"}') $$,
  '22023', null, 'only known vehicle fields can be written');

select is((select count(*)::int from public.vehicles), 0, 'failed imports leave nothing behind');

create temp table result as
select public.save_vehicle_import(null,
  '{"chassis_number":"TSTA1234567890123","brand":"Fictional","model":"One","year":"2024","listing_price":"189900.00"}',
  '[{"key":"f1","storage_path":"11111111-1111-1111-1111-111111111111/imports/s1/brochure.pdf","original_filename":"brochure.pdf","mime_type":"application/pdf","file_size":100,"document_type":"other","extracted_text":"text"}]',
  '[{"storage_path":"11111111-1111-1111-1111-111111111111/imports/s1/photo.jpg","original_filename":"p1.jpg","mime_type":"image/jpeg","file_size":50,"image_type":"arrival"}]',
  '[{"section":"Battery","label":"Capacity","label_alt":"السعة","value_en":"82","unit":"kWh","source_key":"f1","source_page":1},
    {"section":"Features","label":"Features","value_en":"Heated seats","source_key":"f1","source_page":2}]') as id;

select is((select listing_price from public.vehicles where id = (select id from result)), 189900.00::numeric, 'asking price saved (not the sale price)');
select is((select sale_price from public.vehicles where id = (select id from result)), null, 'sale price untouched');
select is((select count(*)::int from public.vehicle_specs where vehicle_id = (select id from result)), 2, 'all specifications saved');
select ok((select bool_and(source_document_id = (select d.id from public.documents d where d.vehicle_id = (select id from result)))
           from public.vehicle_specs where vehicle_id = (select id from result)), 'specs link to their source document');
select ok(exists(select 1 from public.audit_logs where entity_type = 'vehicle_specs'), 'spec inserts are audited');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
select throws_ok($$ select public.save_vehicle_import((select id from result), '{"brand":"Y"}') $$, '42501', null, 'read-only users cannot import');

select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000001');
select is((select count(*)::int from public.vehicle_specs), 0, 'other companies cannot see specifications');

select * from finish();
rollback;
