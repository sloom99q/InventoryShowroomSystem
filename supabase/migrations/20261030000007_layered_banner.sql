-- Spec sheet header banner per car (kit v2 §5): the company provides two layers
-- (logo side with a transparent photo area, and the slogans); each car's photo
-- shows through. doc_banner_path stays as the fallback full banner.
alter table public.companies
  add column doc_banner_left_path text,
  add column doc_banner_text_path text;
