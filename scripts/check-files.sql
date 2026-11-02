-- File integrity check (read-only). Usage:
--   psql -h 127.0.0.1 -p <db port> -U postgres -f scripts/check-files.sql
-- 1. Stored files used by more than one car (must be 0).
-- 2. Photos / documents / receipts whose path isn't in their own car's folder
--    (legacy import folders "<company>/imports/<session>/" are listed separately).
-- 3. Stored files no car, photo, document, receipt or company setting points to (orphans).
with refs as (
  select vehicle_id, storage_path as p, 'photo' as kind from public.vehicle_images
  union all select vehicle_id, thumbnail_path, 'thumbnail' from public.vehicle_images where thumbnail_path is not null
  union all select vehicle_id, storage_path, 'document' from public.documents
  union all select vehicle_id, receipt_storage_path, 'receipt' from public.expenses where receipt_storage_path is not null
)
select '1 shared between cars' as "check", count(*) as problems from (select p from refs group by p having count(distinct vehicle_id) > 1) x
union all
select '2 not in own car folder', count(*) from refs where split_part(p, '/', 2) <> vehicle_id::text and split_part(p, '/', 2) <> 'imports'
union all
select '2b in a legacy import folder', count(*) from refs where split_part(p, '/', 2) = 'imports'
union all
select '3 orphan files', count(*) from storage.objects o
  where o.bucket_id = 'vehicle-files'
    and not exists (select 1 from refs where refs.p = o.name)
    and o.name not in (select unnest(array[logo_path, logo_dark_path, doc_banner_path, doc_watermark_path, doc_banner_left_path, doc_banner_text_path]) from public.companies where logo_path is not null or doc_banner_path is not null)
    and split_part(o.name, '/', 2) <> 'branding';
