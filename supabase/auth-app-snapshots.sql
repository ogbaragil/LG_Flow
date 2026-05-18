-- LG Flow authenticated cloud snapshots
-- Run this after enabling Email auth in Supabase Authentication settings.

drop table if exists public.app_snapshots;

create table public.app_snapshots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_snapshots_updated_at on public.app_snapshots;
create trigger set_app_snapshots_updated_at
before update on public.app_snapshots
for each row execute function public.set_updated_at();

alter table public.app_snapshots enable row level security;

create policy "Users can read own app snapshot"
on public.app_snapshots
for select
using (auth.uid() = user_id);

create policy "Users can insert own app snapshot"
on public.app_snapshots
for insert
with check (auth.uid() = user_id);

create policy "Users can update own app snapshot"
on public.app_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own app snapshot"
on public.app_snapshots
for delete
using (auth.uid() = user_id);

create index if not exists app_snapshots_user_id_idx
on public.app_snapshots(user_id);
