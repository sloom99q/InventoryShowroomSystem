-- Rebuild v3: stages (editable, skippable), accessory quantities, photo cover, edit log access.
begin;
select plan(22);

insert into public.companies (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Showroom A'), ('22222222-2222-2222-2222-222222222222', 'Showroom B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"admin"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'sec-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"secretary"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'viewer-a@test.local', '{"company_id":"11111111-1111-1111-1111-111111111111","role":"viewer"}');

create or replace function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.stage(n text) returns uuid language sql as $$
  select id from public.stages where company_id = '11111111-1111-1111-1111-111111111111' and name_en = n
$$;

select is((select string_agg(name_en, ' → ' order by position) from public.stages where company_id = '11111111-1111-1111-1111-111111111111'),
  'Arrived → In garage → At RTA → Ready → Reserved → Sold → Delivered', 'a new showroom gets the default stages');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
insert into public.vehicles (id, chassis_number, brand, model, arrival_at)
values ('a0000000-0000-0000-0000-000000000001', 'JRNAAAAAAAAA12345', 'Nimbus', 'Arc', '2026-10-28 09:12+04');

select is((select stage_id from public.vehicles where id = 'a0000000-0000-0000-0000-000000000001'), pg_temp.stage('Arrived'), 'a new car starts at Arrived');
select is((select stage_name || ' @ ' || to_char(event_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI') from public.vehicle_events
  where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and event_type = 'stage'), 'Arrived @ 28 Oct 09:12', 'with a journey entry at its arrival time');

select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', pg_temp.stage('At RTA'), '2026-10-31 10:30+04', 'Inspection booked');
select is((select stage_id from public.vehicles where id = 'a0000000-0000-0000-0000-000000000001'), pg_temp.stage('At RTA'), 'it can skip a stage (straight to At RTA)');
select is((select description from public.vehicle_events where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and stage_name = 'At RTA'), 'Inspection booked', 'the move keeps its note');
select is((select created_by from public.vehicle_events where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and stage_name = 'At RTA'),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'and who moved it');

select throws_ok($$ select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', pg_temp.stage('Sold')) $$, '22023', null, 'Sold needs its date');
select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', pg_temp.stage('Sold'), '2026-11-01 16:00+04');
select is((select status::text || ' ' || to_char(sold_at at time zone 'Asia/Dubai', 'DD Mon') from public.vehicles where id = 'a0000000-0000-0000-0000-000000000001'),
  'sold 01 Nov', 'Sold sets the status and the sold date');
select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', pg_temp.stage('Ready'), now(), 'Sale fell through');
select is((select row(status::text, sold_at)::text from public.vehicles where id = 'a0000000-0000-0000-0000-000000000001'),
  row('in_stock', null::timestamptz)::text, 'moving back clears the sale');
select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', pg_temp.stage('Delivered'), '2026-11-02 12:00+04');
select is((select status::text from public.vehicles where id = 'a0000000-0000-0000-0000-000000000001'), 'delivered', 'Delivered');
select is((select count(*)::int from public.vehicle_events where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and event_type = 'stage'), 5, 'every move is on the journey');

select throws_ok($$ select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001',
  (select id from public.stages where company_id = '22222222-2222-2222-2222-222222222222' limit 1), now()) $$, 'P0002', null, 'another showroom''s stage is refused');
select throws_ok($$ insert into public.stages (name_en, position) values ('Export', 8) $$, '42501', null, 'a secretary cannot edit the stage list');
select is((select count(*)::int from public.audit_logs), 0, 'a secretary cannot read the edit log');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000003');
select throws_ok($$ select public.move_vehicle_stage('a0000000-0000-0000-0000-000000000001', pg_temp.stage('Arrived'), now()) $$, 'P0002', null, 'a viewer cannot move cars');

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
update public.stages set name_en = 'With RTA' where id = pg_temp.stage('At RTA');
select is((select stage_name from public.vehicle_events where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and description = 'Inspection booked'),
  'At RTA', 'renaming a stage keeps the journey as it was');
select ok((select count(*) > 0 from public.audit_logs), 'an admin reads the edit log');

-- Accessories: quantity decides present / missing; no quantity = not checked.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
insert into public.accessories (id, vehicle_id, item_type, item_name, quantity) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'smart_key', 'Smart key', 2),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'nfc_card', 'NFC card', null);
select is((select status::text from public.accessories where id = 'b0000000-0000-0000-0000-000000000001'), 'present', 'quantity 2 is present');
select is((select status::text from public.accessories where id = 'b0000000-0000-0000-0000-000000000002'), 'unknown', 'no quantity is not checked');
update public.accessories set quantity = 0 where id = 'b0000000-0000-0000-0000-000000000002';
select is((select status::text from public.accessories where id = 'b0000000-0000-0000-0000-000000000002'), 'missing', 'quantity 0 is missing');
select is((select missing_names from public.vehicle_overview where id = 'a0000000-0000-0000-0000-000000000001'), array['NFC card'], 'the car lists what is missing');

-- Photos: one cover per car.
reset role;
insert into public.vehicle_images (id, company_id, vehicle_id, image_type, storage_path, original_filename, mime_type, file_size) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'arrival', 'x/1.jpg', '1.jpg', 'image/jpeg', 1),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'arrival', 'x/2.jpg', '2.jpg', 'image/jpeg', 1);
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000002');
select public.set_cover_image('c0000000-0000-0000-0000-000000000001');
select public.set_cover_image('c0000000-0000-0000-0000-000000000002');
select is((select array_agg(id::text) from public.vehicle_images where vehicle_id = 'a0000000-0000-0000-0000-000000000001' and is_cover),
  array['c0000000-0000-0000-0000-000000000002'], 'starring a photo makes it the only cover');

select * from finish();
rollback;
