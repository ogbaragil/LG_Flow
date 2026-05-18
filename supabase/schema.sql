-- LG-Flow PWA Supabase schema
-- Snapshot sync table used by the PWA Settings > Sync controls.

create table if not exists public.app_snapshots (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

-- Quick-start policy for a private/single-user app. Tighten before multi-user production use.
drop policy if exists "Allow anonymous app snapshot read" on public.app_snapshots;
drop policy if exists "Allow anonymous app snapshot insert" on public.app_snapshots;
drop policy if exists "Allow anonymous app snapshot update" on public.app_snapshots;

create policy "Allow anonymous app snapshot read"
on public.app_snapshots for select using (true);

create policy "Allow anonymous app snapshot insert"
on public.app_snapshots for insert with check (true);

create policy "Allow anonymous app snapshot update"
on public.app_snapshots for update using (true) with check (true);

-- Optional normalized tables for future reporting / multi-user upgrade.
create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  ndis_number text,
  email text,
  phone text,
  address text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  invoice_number text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  client_email text,
  client_phone text,
  client_address text,
  ndis_number text,
  issue_date date not null,
  due_date date,
  total numeric(12,2) not null default 0,
  notes text,
  status text not null default 'Generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_label text not null,
  service_date date,
  unit_type text not null default 'hours',
  quantity numeric(12,2) not null default 1,
  rate numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  type text not null check (type in ('income', 'expense')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  category text,
  description text not null,
  amount numeric(12,2) not null,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional snapshot table used by the PWA cloud sync buttons.
create table if not exists public.app_snapshots (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

create policy if not exists "Anyone can manage default app snapshot"
on public.app_snapshots
for all
using (true)
with check (true);
