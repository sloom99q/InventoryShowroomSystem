-- Pilot feedback (rebuild v3, phase 0):
--   * "Copy from a previous car" is removed completely.
--   * Admins can permanently delete a car: its rows and its stored files.

-- 1. Copy from a previous car ---------------------------------------------------
drop function if exists public.copy_specs_from(uuid, uuid);
drop trigger if exists vehicle_specs_clear_copied on public.vehicle_specs;
drop function if exists public.clear_copied_marker();
alter table public.vehicle_specs drop column if exists copied_from_vehicle_id;

-- 2. Permanent delete -----------------------------------------------------------
-- Deletes the car and every row that belongs to it in one transaction and returns
-- the storage paths of its files; the app then removes those files (storage files
-- can only be removed through the Storage API). Confirmation: the last 6 characters
-- of the chassis number. The vehicles audit trigger records who deleted which car
-- and when, with the car's full record (chassis included).
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

  delete from public.vehicle_specs where vehicle_id = v.id;
  delete from public.vehicle_images where vehicle_id = v.id;
  delete from public.documents where vehicle_id = v.id;
  delete from public.expenses where vehicle_id = v.id;
  delete from public.accessories where vehicle_id = v.id;
  delete from public.vehicle_events where vehicle_id = v.id;
  delete from public.vehicles where id = v.id;
  return paths;
end $$;

revoke all on function public.delete_vehicle_permanently(uuid, text) from public, anon;
grant execute on function public.delete_vehicle_permanently(uuid, text) to authenticated;

-- Admins may remove their company's files (used right after a permanent delete).
create policy vehicle_files_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-files' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_admin());
