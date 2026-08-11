-- Vibe Coding Library: STATIK + 4 document sections

alter table public.hub_vibe_docs
  add column if not exists statik jsonb not null default '{}'::jsonb;

alter table public.hub_vibe_docs
  add column if not exists description text not null default '';

alter table public.hub_vibe_docs
  add column if not exists author text not null default '';

alter table public.hub_vibe_docs
  add column if not exists readme text not null default '';

alter table public.hub_vibe_docs
  add column if not exists plan_doc text not null default '';

alter table public.hub_vibe_docs
  add column if not exists ux_scenario text not null default '';

alter table public.hub_vibe_docs
  add column if not exists ui_design text not null default '';

alter table public.hub_vibe_docs
  add column if not exists source_files jsonb not null default '{}'::jsonb;

-- migrate legacy single body into readme when empty
update public.hub_vibe_docs
set readme = body
where coalesce(readme, '') = ''
  and coalesce(body, '') <> '';

create index if not exists hub_vibe_docs_statik_l1_idx
  on public.hub_vibe_docs ((statik->>'l1'));
