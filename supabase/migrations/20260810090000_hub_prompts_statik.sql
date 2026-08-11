-- Add STATIK L1~L4 and source filename to hub_prompts

alter table public.hub_prompts
  add column if not exists statik jsonb not null default '{}'::jsonb;

alter table public.hub_prompts
  add column if not exists source_filename text not null default '';

alter table public.hub_prompts
  add column if not exists description text not null default '';

create index if not exists hub_prompts_statik_l1_idx
  on public.hub_prompts ((statik->>'l1'));
