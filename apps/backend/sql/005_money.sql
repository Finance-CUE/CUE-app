-- Money tracking: spends, starting money, khata, subscriptions, assets, nudges.
--
-- Amounts are integer paise (bigint), max 10,00,00,000 rupees. The backend is
-- the only reader and writer. It uses the secret key, which bypasses RLS and
-- keeps its own grants. Everything below exists so that a client ever querying
-- PostgREST directly gets nothing.
--
-- Run in the Supabase SQL editor. Idempotent - safe to re-run.

begin;

-- 1. Spends -------------------------------------------------------------------

create table if not exists public.spends (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  description  text        not null check (char_length(btrim(description)) between 1 and 80),
  amount_paise bigint      not null check (amount_paise between 1 and 10000000000),
  category     text        not null check (
    category in ('food', 'groceries', 'transport', 'shopping', 'bills', 'fun', 'other')
  ),
  spent_on     date        not null,
  created_at   timestamptz not null default now()
);

create index if not exists spends_user_spent_idx
  on public.spends (user_id, spent_on desc);


-- 2. Starting money: one row per user -----------------------------------------

create table if not exists public.starting_money (
  user_id    uuid        primary key references public.users (id) on delete cascade,
  bank_paise bigint      not null check (bank_paise between 0 and 10000000000),
  cash_paise bigint      not null check (cash_paise between 0 and 10000000000),
  set_at     timestamptz not null default now()
);


-- 3. Khata: money lent to / borrowed from people ------------------------------

create table if not exists public.khata_entries (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  direction    text        not null check (direction in ('lent', 'borrowed')),
  person       text        not null check (char_length(btrim(person)) between 1 and 60),
  amount_paise bigint      not null check (amount_paise between 1 and 10000000000),
  note         text        check (note is null or char_length(note) <= 120),
  settled_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists khata_entries_user_open_idx
  on public.khata_entries (user_id) where settled_at is null;


-- 4. Subscriptions ------------------------------------------------------------

create table if not exists public.subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  name         text        not null check (char_length(btrim(name)) between 1 and 60),
  amount_paise bigint      not null check (amount_paise between 1 and 10000000000),
  cadence      text        not null check (cadence in ('monthly', 'yearly')),
  next_due_on  date        not null,
  created_at   timestamptz not null default now()
);

create index if not exists subscriptions_user_due_idx
  on public.subscriptions (user_id, next_due_on);


-- 5. Assets -------------------------------------------------------------------

create table if not exists public.assets (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  name        text        not null check (char_length(btrim(name)) between 1 and 60),
  value_paise bigint      not null check (value_paise between 1 and 10000000000),
  created_at  timestamptz not null default now()
);


-- 6. Nudge preferences live on the profile ------------------------------------

alter table public.users add column if not exists nudge_pre_spend boolean not null default true;
alter table public.users add column if not exists nudge_patterns  boolean not null default true;
alter table public.users add column if not exists nudge_weekly    boolean not null default true;


-- 7. Lock every table down ----------------------------------------------------

alter table public.spends enable row level security;
alter table public.starting_money enable row level security;
alter table public.khata_entries enable row level security;
alter table public.subscriptions enable row level security;
alter table public.assets enable row level security;

drop policy if exists spends_select_own on public.spends;
create policy spends_select_own on public.spends
  for select using (auth.uid() = user_id);

drop policy if exists starting_money_select_own on public.starting_money;
create policy starting_money_select_own on public.starting_money
  for select using (auth.uid() = user_id);

drop policy if exists khata_entries_select_own on public.khata_entries;
create policy khata_entries_select_own on public.khata_entries
  for select using (auth.uid() = user_id);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists assets_select_own on public.assets;
create policy assets_select_own on public.assets
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies exist, so RLS already denies writes. The
-- revokes remove the tables from the PostgREST surface for anon and
-- authenticated entirely; the secret key keeps its own grants.
revoke all on table public.spends from anon, authenticated;
revoke all on table public.starting_money from anon, authenticated;
revoke all on table public.khata_entries from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.assets from anon, authenticated;

commit;
