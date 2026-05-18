create table if not exists public.app_snapshots (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

-- Simple single-user policy for quick start. For production, replace with authenticated user-specific rows.
create policy "Allow anonymous app snapshot read" on public.app_snapshots for select using (true);
create policy "Allow anonymous app snapshot insert" on public.app_snapshots for insert with check (true);
create policy "Allow anonymous app snapshot update" on public.app_snapshots for update using (true) with check (true);
