-- Best Practice Library: PDF metadata + AI summary fields

alter table public.hub_cases
  add column if not exists pdf_filename text not null default '';

alter table public.hub_cases
  add column if not exists key_points jsonb not null default '[]'::jsonb;

alter table public.hub_cases
  add column if not exists ai_summary text not null default '';
