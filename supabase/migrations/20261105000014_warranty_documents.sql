-- Warranty certificates and terms are documents of the car (with versions, like any document).
alter type public.document_type add value if not exists 'warranty_certificate';
alter type public.document_type add value if not exists 'warranty_terms';
