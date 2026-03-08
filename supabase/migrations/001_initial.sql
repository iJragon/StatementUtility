-- Enable RLS
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_hash text not null,
  file_name text not null,
  property_name text,
  period text,
  analyzed_at timestamptz default now() not null,
  statement_data jsonb not null,
  ratios_data jsonb not null,
  anomalies_data jsonb not null,
  trends_data jsonb not null,
  summary_text text,
  chat_history jsonb default '[]'::jsonb,
  unique(user_id, file_hash)
);

alter table public.analyses enable row level security;

create policy "Users can only access their own analyses"
  on public.analyses
  for all
  using (auth.uid() = user_id);

create index analyses_user_id_idx on public.analyses(user_id);
create index analyses_analyzed_at_idx on public.analyses(analyzed_at desc);
