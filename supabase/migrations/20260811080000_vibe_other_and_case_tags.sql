-- Vibe other doc section + Best Practice tags

alter table public.hub_vibe_docs
  add column if not exists other_doc text not null default '';

alter table public.hub_cases
  add column if not exists tags jsonb not null default '[]'::jsonb;
