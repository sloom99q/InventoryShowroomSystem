-- Per-company branding (each showroom styles its own workspace) and language.

alter table public.companies
  add column accent_color   text not null default '#2f5bd3' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add column sidebar_color  text not null default '#ffffff' check (sidebar_color ~ '^#[0-9a-fA-F]{6}$'),
  add column theme_mode     text not null default 'light' check (theme_mode in ('light', 'dark')),
  add column logo_path      text,
  add column logo_dark_path text,
  add column default_locale text not null default 'en' check (default_locale in ('en', 'ar'));

-- null = follow the company default
alter table public.profiles
  add column locale text check (locale in ('en', 'ar'));

-- Anyone may set their own language; nothing else on their profile.
create or replace function public.set_my_locale(p_locale text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_locale is not null and p_locale not in ('en', 'ar') then
    raise exception 'Unsupported language' using errcode = '22023';
  end if;
  update public.profiles set locale = p_locale where id = auth.uid();
end $$;
revoke execute on function public.set_my_locale(text) from anon, public;
grant execute on function public.set_my_locale(text) to authenticated;

-- Branding files live under <company_id>/branding/. Only admins upload them.
create policy vehicle_files_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-files'
              and (storage.foldername(name))[1] = public.current_company_id()::text
              and (storage.foldername(name))[2] = 'branding'
              and public.is_admin());
