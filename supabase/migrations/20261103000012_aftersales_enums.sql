-- After-Sales: two new roles and a delivery photo category (committed before they're used).
alter type public.app_role add value if not exists 'sales_manager';
alter type public.app_role add value if not exists 'technician';
alter type public.image_type add value if not exists 'delivery';
