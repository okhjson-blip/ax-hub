-- AX Hub knowledge library tables (same Supabase as ax-pjt-dashboard)

create extension if not exists pgcrypto;

create table if not exists public.hub_task_assets (
  id text primary key,
  source_task_id text not null,
  source_company_id text,
  source_participant_id text,
  title text not null,
  company_name text not null default '',
  participant_name text not null default '',
  dept text not null default '',
  difficulty text not null default '중',
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  start_date text not null default '',
  end_date text not null default '',
  goal text not null default '',
  as_is_process text not null default '',
  to_be_process text not null default '',
  body text not null default '',
  tags jsonb not null default '[]'::jsonb,
  extras jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_task_id)
);

create table if not exists public.hub_prompts (
  id text primary key,
  category text not null default '일반',
  title text not null,
  template text not null default '',
  variables jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  author text not null default '',
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_vibe_docs (
  id text primary key,
  category text not null default '일반',
  doc_type text not null default 'md' check (doc_type in ('md', 'design', 'guide', 'tip')),
  title text not null,
  body text not null default '',
  storage_path text not null default '',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_cases (
  id text primary key,
  category text not null default '일반',
  title text not null,
  summary text not null default '',
  before_text text not null default '',
  after_text text not null default '',
  outcome text not null default '',
  efficiency text not null default '',
  pdf_path text not null default '',
  gemini_raw jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_task_assets_company_idx on public.hub_task_assets (company_name);
create index if not exists hub_prompts_category_idx on public.hub_prompts (category);
create index if not exists hub_vibe_docs_category_idx on public.hub_vibe_docs (category);
create index if not exists hub_cases_status_idx on public.hub_cases (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hub_task_assets_set_updated_at on public.hub_task_assets;
create trigger hub_task_assets_set_updated_at
before update on public.hub_task_assets
for each row execute function public.set_updated_at();

drop trigger if exists hub_prompts_set_updated_at on public.hub_prompts;
create trigger hub_prompts_set_updated_at
before update on public.hub_prompts
for each row execute function public.set_updated_at();

drop trigger if exists hub_vibe_docs_set_updated_at on public.hub_vibe_docs;
create trigger hub_vibe_docs_set_updated_at
before update on public.hub_vibe_docs
for each row execute function public.set_updated_at();

drop trigger if exists hub_cases_set_updated_at on public.hub_cases;
create trigger hub_cases_set_updated_at
before update on public.hub_cases
for each row execute function public.set_updated_at();

alter table public.hub_task_assets enable row level security;
alter table public.hub_prompts enable row level security;
alter table public.hub_vibe_docs enable row level security;
alter table public.hub_cases enable row level security;

-- service role bypasses RLS; no anon policies (API-only access)
