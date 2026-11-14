-- Money spec completion: subscription billing days and cycles, balance history,
-- subscription spends.
--
-- Subscriptions move from "cadence + next_due_on" to "billing_day + starts_on":
-- a billing day of 31 is clamped to the month's length each month and never
-- drifts. Each (subscription, month) is answered once in subscription_cycles.
-- The assets table stays in the database, unused.
--
-- Run in the Supabase SQL editor after 005_money.sql. Idempotent - safe to re-run.
-- Checks for the functions below: sql/smoke_006.sql.

begin;

-- 1. Spends may be subscription payments --------------------------------------

alter table public.spends drop constraint if exists spends_category_check;
alter table public.spends add constraint spends_category_check check (
  category in ('food', 'groceries', 'transport', 'shopping', 'bills', 'fun', 'other', 'subscription')
);


-- 2. Subscriptions: billing day, start date, active flag ----------------------

alter table public.subscriptions
  add column if not exists billing_day smallint check (billing_day between 1 and 31);
alter table public.subscriptions add column if not exists starts_on date;
alter table public.subscriptions add column if not exists active boolean not null default true;

-- Backfill from the old columns, only while they still exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'next_due_on'
  ) then
    update public.subscriptions
      set billing_day = extract(day from next_due_on)::smallint
      where billing_day is null;
    -- Today, not created_at: existing subscriptions must not get a retroactive prompt queue.
    update public.subscriptions set starts_on = current_date where starts_on is null;
    update public.subscriptions set active = false where cadence = 'yearly';
  end if;
end $$;

alter table public.subscriptions alter column billing_day set not null;
alter table public.subscriptions alter column starts_on set not null;

drop index if exists public.subscriptions_user_due_idx;
alter table public.subscriptions drop column if exists cadence;
alter table public.subscriptions drop column if exists next_due_on;

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

-- One active subscription per name per user. Retire later duplicates first so the
-- index cannot fail on existing rows.
update public.subscriptions s set active = false
where s.active and exists (
  select 1 from public.subscriptions o
  where o.user_id = s.user_id and o.active
    and lower(btrim(o.name)) = lower(btrim(s.name))
    and (o.created_at, o.id) < (s.created_at, s.id)
);

create unique index if not exists subscriptions_user_name_active_uidx
  on public.subscriptions (user_id, lower(btrim(name))) where active;


-- 3. Subscription cycles: one answer per subscription per month ---------------

create table if not exists public.subscription_cycles (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.users (id) on delete cascade,
  subscription_id uuid        not null references public.subscriptions (id) on delete cascade,
  month           date        not null check (extract(day from month) = 1),
  status          text        not null check (status in ('logged', 'skipped')),
  -- Deleting a Yes-logged spend deletes its cycle, which re-opens that month.
  spend_id        uuid        references public.spends (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (subscription_id, month)
);

create index if not exists subscription_cycles_user_idx
  on public.subscription_cycles (user_id);


-- 4. Balance history: every change to starting money appends a snapshot -------

create table if not exists public.balance_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  bank_paise  bigint      not null,
  cash_paise  bigint      not null,
  recorded_at timestamptz not null default now()
);

create index if not exists balance_history_user_idx
  on public.balance_history (user_id, recorded_at);

-- Seed users who already set a balance; skip anyone with history.
insert into public.balance_history (user_id, bank_paise, cash_paise, recorded_at)
select s.user_id, s.bank_paise, s.cash_paise, s.set_at
from public.starting_money s
where not exists (select 1 from public.balance_history h where h.user_id = s.user_id);

create or replace function public.record_balance_history() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or (new.bank_paise, new.cash_paise) is distinct from (old.bank_paise, old.cash_paise) then
    insert into public.balance_history (user_id, bank_paise, cash_paise)
    values (new.user_id, new.bank_paise, new.cash_paise);
  end if;
  return new;
end;
$$;

revoke execute on function public.record_balance_history() from public, anon, authenticated;

drop trigger if exists starting_money_history on public.starting_money;
create trigger starting_money_history
  after insert or update on public.starting_money
  for each row execute function public.record_balance_history();


-- 5. Lock the new tables down (same as 005) ------------------------------------

alter table public.subscription_cycles enable row level security;
alter table public.balance_history enable row level security;

drop policy if exists subscription_cycles_select_own on public.subscription_cycles;
create policy subscription_cycles_select_own on public.subscription_cycles
  for select using (auth.uid() = user_id);

drop policy if exists balance_history_select_own on public.balance_history;
create policy balance_history_select_own on public.balance_history
  for select using (auth.uid() = user_id);

revoke all on table public.subscription_cycles from anon, authenticated;
revoke all on table public.balance_history from anon, authenticated;


-- 6. Atomic writes -------------------------------------------------------------
-- Called only by the backend with the secret key.

-- A subscription payment: the spend, the subscription (reused when an active
-- one has the same name) and the "logged" cycle for that month, in one step.
create or replace function public.log_subscription_spend(
  p_user        uuid,
  p_description text,
  p_amount      bigint,
  p_spent_on    date,
  p_billing_day int
) returns public.spends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spend public.spends;
  v_sub   uuid;
begin
  insert into public.spends (user_id, description, amount_paise, category, spent_on)
  values (p_user, p_description, p_amount, 'subscription', p_spent_on)
  returning * into v_spend;

  insert into public.subscriptions (user_id, name, amount_paise, billing_day, starts_on)
  values (p_user, btrim(p_description), p_amount, p_billing_day, p_spent_on)
  on conflict (user_id, lower(btrim(name))) where active do nothing
  returning id into v_sub;

  if v_sub is null then
    -- An active subscription with this name exists (or a concurrent call just made it): reuse it.
    update public.subscriptions
      set amount_paise = p_amount, billing_day = p_billing_day
      where user_id = p_user and active and lower(btrim(name)) = lower(btrim(p_description))
      returning id into v_sub;
  end if;

  insert into public.subscription_cycles (user_id, subscription_id, month, status, spend_id)
  values (p_user, v_sub, date_trunc('month', p_spent_on)::date, 'logged', v_spend.id)
  on conflict (subscription_id, month) do nothing;

  return v_spend;
end;
$$;

-- "Is it still active?" for one month. Only the first answer for a month has
-- an effect, so a double tap or retry never logs twice. False when the
-- subscription is not the user's.
create or replace function public.answer_subscription_cycle(
  p_user         uuid,
  p_subscription uuid,
  p_month        date,
  p_active       boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub      public.subscriptions;
  v_cycle    uuid;
  v_spend    uuid;
  v_month    date := date_trunc('month', p_month)::date;
  v_last_day int;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription and user_id = p_user;
  if not found then
    return false;
  end if;

  -- Nothing to answer: inactive, before the subscription started, or in the future.
  if not v_sub.active
     or v_month < date_trunc('month', v_sub.starts_on)::date
     or v_month > date_trunc('month', current_date + 1)::date then
    return true;
  end if;

  insert into public.subscription_cycles (user_id, subscription_id, month, status)
  values (p_user, p_subscription, v_month, case when p_active then 'logged' else 'skipped' end)
  on conflict (subscription_id, month) do nothing
  returning id into v_cycle;

  if v_cycle is not null then
    if p_active then
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::int;
      insert into public.spends (user_id, description, amount_paise, category, spent_on)
      values (
        p_user, v_sub.name, v_sub.amount_paise, 'subscription',
        v_month + (least(v_sub.billing_day, v_last_day) - 1)
      )
      returning id into v_spend;
      update public.subscription_cycles set spend_id = v_spend where id = v_cycle;
    else
      update public.subscriptions set active = false where id = p_subscription;
    end if;
  end if;

  return true;
end;
$$;

revoke execute on function
  public.log_subscription_spend(uuid, text, bigint, date, int),
  public.answer_subscription_cycle(uuid, uuid, date, boolean)
from public, anon, authenticated;

grant execute on function
  public.log_subscription_spend(uuid, text, bigint, date, int),
  public.answer_subscription_cycle(uuid, uuid, date, boolean)
to service_role;

commit;
