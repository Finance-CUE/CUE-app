-- Scheduled payments and recurring income (dashboard spec P1, sections 4.4 and 4.8).
--
-- Subscriptions grow into scheduled items: subscriptions, bills, rent, EMIs,
-- other payments and recurring income. Each due date is answered once in
-- subscription_cycles (paid or skipped); a payment is recorded only when the
-- user marks it paid, so a due is never an expense by itself and a passed
-- date never marks anything paid.
--
-- Existing rows become monthly subscriptions with reminders on, exactly as
-- they behave today. The old routes (/money/subscriptions) keep working and
-- see only those monthly subscriptions.
--
-- Run in the Supabase SQL editor after 011_ledger_writes.sql, before deploying
-- the backend that uses it. Idempotent - safe to re-run.

begin;

-- 1. What a scheduled item is ---------------------------------------------------

alter table public.subscriptions
  add column if not exists kind text not null default 'subscription';
alter table public.subscriptions drop constraint if exists subscriptions_kind_check;
alter table public.subscriptions add constraint subscriptions_kind_check
  check (kind in ('subscription', 'bill', 'rent', 'emi', 'other', 'income'));

-- 'once' is a single future payment (a spend added for a future date).
alter table public.subscriptions
  add column if not exists frequency text not null default 'monthly';
alter table public.subscriptions drop constraint if exists subscriptions_frequency_check;
alter table public.subscriptions add constraint subscriptions_frequency_check
  check (frequency in ('monthly', 'quarterly', 'yearly', 'once'));

-- The first due date. Null on rows from before 012: their first due is the
-- first billing day after starts_on, as the old routes count it.
alter table public.subscriptions add column if not exists first_due_on date;

-- The account it is paid from (or, for income, paid into).
alter table public.subscriptions add column if not exists account_id uuid;
alter table public.subscriptions add column if not exists category text;
-- Variable bills and income: Mark paid asks for the amount, prefilled with this one.
alter table public.subscriptions add column if not exists variable boolean not null default false;
-- On by default: every subscription was reminded about before 012.
alter table public.subscriptions add column if not exists reminder boolean not null default true;
alter table public.subscriptions add column if not exists client_key uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_id_user_key') then
    alter table public.subscriptions add constraint subscriptions_id_user_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_account_fk') then
    alter table public.subscriptions add constraint subscriptions_account_fk
      foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_client_key_key') then
    alter table public.subscriptions add constraint subscriptions_client_key_key unique (user_id, client_key);
  end if;
end $$;

-- A category from the ledger's lists: income categories for income, expense ones otherwise.
alter table public.subscriptions drop constraint if exists subscriptions_category_check;
alter table public.subscriptions add constraint subscriptions_category_check check (
  category is null
  or (kind = 'income' and category in
      ('salary', 'business', 'freelance', 'interest', 'dividends', 'gifts', 'refunds', 'other'))
  or (kind <> 'income' and category in
      ('food_delivery', 'groceries', 'transport', 'shopping', 'bills', 'subscriptions',
       'entertainment', 'health', 'education', 'travel', 'personal_care', 'other'))
);

alter table public.subscriptions drop constraint if exists subscriptions_once_has_date;
alter table public.subscriptions add constraint subscriptions_once_has_date
  check (frequency <> 'once' or first_due_on is not null);


-- 2. Entries that belong to a scheduled item ------------------------------------
-- Payments marked paid, and entries saved with "recurring" on. History's
-- Recurring filter reads this. Cancelling an item keeps its entries.

alter table public.transactions add column if not exists schedule_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_schedule_fk') then
    alter table public.transactions add constraint transactions_schedule_fk
      foreign key (schedule_id, user_id) references public.subscriptions (id, user_id)
      on delete set null (schedule_id);
  end if;
end $$;

create index if not exists transactions_schedule_idx
  on public.transactions (schedule_id) where schedule_id is not null;

-- Payments logged before 012 are linked through their cycle.
update public.transactions t set schedule_id = c.subscription_id
from public.subscription_cycles c
where c.transaction_id = t.id and t.schedule_id is null;


-- 3. Mark paid and Skip ------------------------------------------------------------
-- One answer per item per month. A month whose payment was deleted is open
-- again (as in answer_cycle_ledger, 011). Skip answers this month only; the
-- item stays active. Cancel is a plain update of `active`.

-- Mark paid (or received, for income): the entry and the answer together.
-- Returns the entry; a retry with the same client key returns the one already
-- made. An all-null row when the item isn't the user's or the month was
-- already answered.
create or replace function public.pay_scheduled(
  p_user       uuid,
  p_schedule   uuid,
  p_month      date,
  p_client_key uuid,
  p_amount     bigint,
  p_account    uuid,
  p_on         date
) returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item  public.subscriptions;
  v_txn   public.transactions;
  v_cycle uuid;
  v_month date := date_trunc('month', p_month)::date;
begin
  select * into v_txn from public.transactions
  where user_id = p_user and client_key = p_client_key;
  if found then
    return v_txn;
  end if;

  select * into v_item from public.subscriptions where id = p_schedule and user_id = p_user;
  if not found then
    return null;
  end if;

  delete from public.subscription_cycles c
  using public.transactions t
  where c.subscription_id = p_schedule and c.month = v_month
    and c.transaction_id = t.id and t.deleted_at is not null;

  insert into public.subscription_cycles (user_id, subscription_id, month, status)
  values (p_user, p_schedule, v_month, 'logged')
  on conflict (subscription_id, month) do nothing
  returning id into v_cycle;
  if v_cycle is null then
    return null;
  end if;

  insert into public.transactions (user_id, client_key, type, amount_paise, account_id, category,
                                   description, occurred_on, source, schedule_id)
  values (p_user, p_client_key,
          case when v_item.kind = 'income' then 'income' else 'expense' end,
          p_amount, p_account,
          coalesce(v_item.category,
                   case v_item.kind
                     when 'income' then 'other'
                     when 'subscription' then 'subscriptions'
                     when 'other' then 'other'
                     else 'bills' end),
          v_item.name, p_on, 'app', p_schedule)
  returning * into v_txn;

  update public.subscription_cycles set transaction_id = v_txn.id where id = v_cycle;
  return v_txn;
end;
$$;

-- Skip one due date. False when the item isn't the user's or the month was
-- already answered.
create or replace function public.skip_scheduled(
  p_user     uuid,
  p_schedule uuid,
  p_month    date
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle uuid;
  v_month date := date_trunc('month', p_month)::date;
begin
  if not exists (select 1 from public.subscriptions where id = p_schedule and user_id = p_user) then
    return false;
  end if;

  delete from public.subscription_cycles c
  using public.transactions t
  where c.subscription_id = p_schedule and c.month = v_month
    and c.transaction_id = t.id and t.deleted_at is not null;

  insert into public.subscription_cycles (user_id, subscription_id, month, status)
  values (p_user, p_schedule, v_month, 'skipped')
  on conflict (subscription_id, month) do nothing
  returning id into v_cycle;
  return v_cycle is not null;
end;
$$;

-- Every answer with its status, leaving out paid months whose entry was deleted.
create or replace function public.schedule_answers(p_user uuid)
returns table (subscription_id uuid, month date, status text, transaction_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.subscription_id, c.month, c.status, c.transaction_id
  from public.subscription_cycles c
  left join public.transactions t on t.id = c.transaction_id
  where c.user_id = p_user and (t.id is null or t.deleted_at is null)
  order by c.id;
$$;

revoke execute on function
  public.pay_scheduled(uuid, uuid, date, uuid, bigint, uuid, date),
  public.skip_scheduled(uuid, uuid, date),
  public.schedule_answers(uuid)
from public, anon, authenticated;

grant execute on function
  public.pay_scheduled(uuid, uuid, date, uuid, bigint, uuid, date),
  public.skip_scheduled(uuid, uuid, date),
  public.schedule_answers(uuid)
to service_role;

commit;
