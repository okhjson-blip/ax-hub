-- App settings (e.g. Gemini API key) — service role only via API

create table if not exists public.hub_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.hub_settings enable row level security;
