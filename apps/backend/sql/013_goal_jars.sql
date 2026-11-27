-- Goal Jars (dashboard spec P2, section 4.7).
--
-- A jar sets money aside inside one of the user's accounts. Adding or
-- withdrawing only moves the allocation: account balances and net worth never
-- change, and a withdrawal is never income (rules 2 and 11). That is why jar
-- moves live in their own table, not in the transactions ledger.
--
-- A jar's money is the sum of its live moves; an account's money in jars is the
-- sum of live moves recorded against it. Deleting a move (Undo) sets deleted_at.
--
-- Run in the Supabase SQL editor after 012_scheduled.sql, before deploying the
-- backend that uses it. Idempotent - safe to re-run.

begin;

-- 1. Jars ------------------------------------------------------------------------

create table if not exists public.goal_jars (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references public.users (id) on delete cascade,
  client_key           uuid        not null,
  name                 text        not null check (char_length(btrim(name)) between 1 and 40),
  -- An emoji (one grapheme can be several code points, so allow a few).
  icon                 text        not null check (char_length(icon) between 1 and 8),
  target_paise         bigint      not null check (target_paise between 1 and 10000000000),
  target_date          date,
  -- The account the jar's money is set aside in.
  account_id           uuid        not null,
  -- How money is added: by hand, or suggested weekly, monthly or after each payday.
  method               text        not null default 'manual'
                                   check (method in ('manual', 'weekly', 'monthly', 'payday')),
  contribution_paise   bigint      check (contribution_paise is null or contribution_paise between 1 and 10000000000),
  -- The next suggested contribution. Nothing is added until the user approves it.
  next_contribution_on date,
  status               text        not null default 'active'
                                   check (status in ('active', 'paused', 'complete', 'archived')),
  completed_at         timestamptz,
  -- The one-time "Reached" celebration has been shown.
  celebrated           boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, client_key),
  unique (id, user_id),
  constraint goal_jars_account_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint goal_jars_contribution check (method = 'manual' or contribution_paise is not null)
);

create index if not exists goal_jars_user_idx on public.goal_jars (user_id);


-- 2. Moves: every add and withdrawal ----------------------------------------------

create table if not exists public.jar_moves (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  client_key   uuid        not null,
  jar_id       uuid        not null,
  -- Positive adds to the jar, negative withdraws from it.
  amount_paise bigint      not null check (amount_paise <> 0 and abs(amount_paise) <= 10000000000),
  -- The account the money is set aside in (or released from).
  account_id   uuid        not null,
  occurred_on  date        not null,
  note         text        check (note is null or char_length(note) <= 120),
  -- An approved automatic contribution.
  auto         boolean     not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, client_key),
  constraint jar_moves_jar_fk foreign key (jar_id, user_id)
    references public.goal_jars (id, user_id) on delete cascade,
  constraint jar_moves_account_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict
);

create index if not exists jar_moves_user_idx on public.jar_moves (user_id) where deleted_at is null;
create index if not exists jar_moves_jar_idx on public.jar_moves (jar_id);


-- 3. Lock both tables down (same as the ledger) ---------------------------------

alter table public.goal_jars enable row level security;
alter table public.jar_moves enable row level security;

drop policy if exists goal_jars_select_own on public.goal_jars;
create policy goal_jars_select_own on public.goal_jars for select using (auth.uid() = user_id);

drop policy if exists jar_moves_select_own on public.jar_moves;
create policy jar_moves_select_own on public.jar_moves for select using (auth.uid() = user_id);

revoke all on table public.goal_jars from anon, authenticated;
revoke all on table public.jar_moves from anon, authenticated;

commit;
