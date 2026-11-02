-- Rebuild v3: the default accessory catalogue and the one-tap expense types.
-- (New enum values must be committed before they're used, so they get their own migration.)
alter type public.accessory_type add value if not exists 'charging_cable';
alter type public.accessory_type add value if not exists 'floor_mats';
alter type public.accessory_type add value if not exists 'owners_manual';
alter type public.accessory_type add value if not exists 'warning_triangle';

alter type public.expense_category add value if not exists 'garage';
alter type public.expense_category add value if not exists 'rta';
alter type public.expense_category add value if not exists 'detailing';
alter type public.expense_category add value if not exists 'tinting';
alter type public.expense_category add value if not exists 'parts';
