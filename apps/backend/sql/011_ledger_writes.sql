-- Ledger writes for the old endpoints (dashboard spec P0, step 2b).
--
-- From this backend release, spends, starting money, Khata and subscription
-- payments are written to the ledger (010) instead of the old tables. The old
-- functions log_subscription_spend and answer_subscription_cycle stay as they
-- are, so the previous backend keeps working until the new one is live.
--
-- Rollout order:
--   1. Run 010_ledger.sql, then this file, then sql/check_010.sql (all rows ok).
--   2. Deploy the backend.
--   3. Run 010_ledger.sql and this file once more. Both are idempotent: 010
--      copies anyone who signed up in between, and step 5 below copies spends
--      and Khata entries the old backend wrote during the deploy.

begin;

-- 1. Rows written for a user who has no account yet ----------------------------
-- The old app lets someone log spends and Khata before setting a balance. Those
-- rows have no account, like copied ones; they never move a balance.

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('app', 'migration', 'legacy'));

alter table public.transactions drop constraint if exists transactions_account_required;
alter table public.transactions add constraint transactions_account_required
  check (account_id is not null or source in ('migration', 'legacy'));


-- 2. Khata: the person record and its ledger entry together --------------------

-- Lend or borrow. p_account is where the money left or arrived (the account
-- chip, default Cash); null only for a user with no accounts. A retry with the
-- same client key returns the entry it already made.
create or replace function public.add_khata_entry(
  p_user       uuid,
  p_client_key uuid,
  p_direction  text,
  p_person     text,
  p_amount     bigint,
  p_note       text,
  p_account    uuid,
  p_on         date
) returns public.khata_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.khata_entries;
begin
  select k.* into v_entry
  from public.transactions t join public.khata_entries k on k.id = t.khata_entry_id
  where t.user_id = p_user and t.client_key = p_client_key;
  if found then
    return v_entry;
  end if;

  insert into public.khata_entries (user_id, direction, person, amount_paise, note)
  values (p_user, p_direction, btrim(p_person), p_amount, p_note)
  returning * into v_entry;

  insert into public.transactions (user_id, client_key, type, amount_paise, account_id,
                                   khata_entry_id, description, note, occurred_on, source)
  values (p_user, p_client_key,
          case p_direction when 'lent' then 'lend' else 'borrow' end,
          p_amount, p_account, v_entry.id, v_entry.person, v_entry.note, p_on,
          case when p_account is null then 'legacy' else 'app' end);

  return v_entry;
end;
$$;

-- Settle: money lent comes back into p_account, money borrowed is paid from it.
-- Returns nothing (all-null row) when the entry is missing, not the user's or
-- already settled, so a double tap settles once.
create or replace function public.settle_khata_entry(
  p_user    uuid,
  p_entry   uuid,
  p_account uuid,
  p_on      date
) returns public.khata_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.khata_entries;
begin
  update public.khata_entries set settled_at = now()
  where id = p_entry and user_id = p_user and settled_at is null
  returning * into v_entry;
  if not found then
    return null;
  end if;

  insert into public.transactions (user_id, type, amount_paise, account_id, khata_entry_id,
                                   description, occurred_on, source)
  values (p_user,
          case v_entry.direction when 'lent' then 'repayment_received' else 'repayment_made' end,
          v_entry.amount_paise, p_account, v_entry.id, v_entry.person, p_on,
          case when p_account is null then 'legacy' else 'app' end);

  return v_entry;
end;
$$;


-- 3. Subscription payments on the ledger -----------------------------------------

-- Same as log_subscription_spend (006), writing an expense instead of a spend.
create or replace function public.log_subscription_txn(
  p_user        uuid,
  p_account     uuid,
  p_description text,
  p_amount      bigint,
  p_on          date,
  p_billing_day int
) returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn public.transactions;
  v_sub uuid;
begin
  insert into public.transactions (user_id, type, amount_paise, account_id, category,
                                   description, occurred_on, source)
  values (p_user, 'expense', p_amount, p_account, 'subscriptions', btrim(p_description), p_on,
          case when p_account is null then 'legacy' else 'app' end)
  returning * into v_txn;

  insert into public.subscriptions (user_id, name, amount_paise, billing_day, starts_on)
  values (p_user, btrim(p_description), p_amount, p_billing_day, p_on)
  on conflict (user_id, lower(btrim(name))) where active do nothing
  returning id into v_sub;

  if v_sub is null then
    update public.subscriptions
      set amount_paise = p_amount, billing_day = p_billing_day
      where user_id = p_user and active and lower(btrim(name)) = lower(btrim(p_description))
      returning id into v_sub;
  end if;

  insert into public.subscription_cycles (user_id, subscription_id, month, status, transaction_id)
  values (p_user, v_sub, date_trunc('month', p_on)::date, 'logged', v_txn.id)
  on conflict (subscription_id, month) do nothing;

  return v_txn;
end;
$$;

-- Same as answer_subscription_cycle (006), writing an expense. A month whose
-- logged payment was deleted counts as unanswered again, as it did when the
-- spend's delete cascaded to its cycle.
create or replace function public.answer_cycle_ledger(
  p_user         uuid,
  p_subscription uuid,
  p_month        date,
  p_active       boolean,
  p_account      uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub      public.subscriptions;
  v_cycle    uuid;
  v_txn      uuid;
  v_month    date := date_trunc('month', p_month)::date;
  v_last_day int;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription and user_id = p_user;
  if not found then
    return false;
  end if;

  if not v_sub.active
     or v_month < date_trunc('month', v_sub.starts_on)::date
     or v_month > date_trunc('month', current_date + 1)::date then
    return true;
  end if;

  delete from public.subscription_cycles c
  using public.transactions t
  where c.subscription_id = p_subscription and c.month = v_month
    and c.transaction_id = t.id and t.deleted_at is not null;

  insert into public.subscription_cycles (user_id, subscription_id, month, status)
  values (p_user, p_subscription, v_month, case when p_active then 'logged' else 'skipped' end)
  on conflict (subscription_id, month) do nothing
  returning id into v_cycle;

  if v_cycle is not null then
    if p_active then
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::int;
      insert into public.transactions (user_id, type, amount_paise, account_id, category,
                                       description, occurred_on, source)
      values (p_user, 'expense', v_sub.amount_paise, p_account, 'subscriptions', v_sub.name,
              v_month + (least(v_sub.billing_day, v_last_day) - 1),
              case when p_account is null then 'legacy' else 'app' end)
      returning id into v_txn;
      update public.subscription_cycles set transaction_id = v_txn where id = v_cycle;
    else
      update public.subscriptions set active = false where id = p_subscription;
    end if;
  end if;

  return true;
end;
$$;

-- Months already answered per subscription, leaving out logged months whose
-- payment was deleted.
create or replace function public.answered_cycles(p_user uuid)
returns table (subscription_id uuid, month date)
language sql
stable
security definer
set search_path = public
as $$
  select c.subscription_id, c.month
  from public.subscription_cycles c
  left join public.transactions t on t.id = c.transaction_id
  where c.user_id = p_user and (t.id is null or t.deleted_at is null)
  order by c.id;
$$;


-- 4. Only the backend may call these -----------------------------------------------

revoke execute on function
  public.add_khata_entry(uuid, uuid, text, text, bigint, text, uuid, date),
  public.settle_khata_entry(uuid, uuid, uuid, date),
  public.log_subscription_txn(uuid, uuid, text, bigint, date, int),
  public.answer_cycle_ledger(uuid, uuid, date, boolean, uuid),
  public.answered_cycles(uuid)
from public, anon, authenticated;

grant execute on function
  public.add_khata_entry(uuid, uuid, text, text, bigint, text, uuid, date),
  public.settle_khata_entry(uuid, uuid, uuid, date),
  public.log_subscription_txn(uuid, uuid, text, bigint, date, int),
  public.answer_cycle_ledger(uuid, uuid, date, boolean, uuid),
  public.answered_cycles(uuid)
to service_role;


-- 5. Catch up rows the old backend wrote after 010 copied the user -----------------
-- Only users already in the ledger; anyone else is copied by re-running 010.
-- Spends go on the user's first savings account, as in 010.

with copied as (
  select distinct user_id from public.accounts
  union
  select distinct user_id from public.transactions
)
insert into public.transactions (id, user_id, type, amount_paise, account_id, category,
                                 description, occurred_on, source, legacy_spend_id,
                                 created_at, updated_at)
select s.id, s.user_id, 'expense', s.amount_paise,
       (select a.id from public.accounts a
        where a.user_id = s.user_id and a.kind = 'savings' and a.archived_at is null
        order by a.created_at, a.id limit 1),
       case s.category
         when 'food'         then 'food_delivery'
         when 'fun'          then 'entertainment'
         when 'subscription' then 'subscriptions'
         else s.category
       end,
       s.description, s.spent_on, 'migration', s.id, s.created_at, s.created_at
from public.spends s
join copied c on c.user_id = s.user_id
where not exists (
  select 1 from public.transactions t where t.legacy_spend_id = s.id or t.id = s.id
);

with copied as (
  select distinct user_id from public.accounts
  union
  select distinct user_id from public.transactions
)
insert into public.transactions (user_id, type, amount_paise, khata_entry_id, description,
                                 note, occurred_on, source, created_at, updated_at)
select k.user_id,
       case k.direction when 'lent' then 'lend' else 'borrow' end,
       k.amount_paise, k.id, k.person, k.note,
       (k.created_at at time zone 'Asia/Kolkata')::date, 'migration', k.created_at, k.created_at
from public.khata_entries k
join copied c on c.user_id = k.user_id
where not exists (
  select 1 from public.transactions t
  where t.khata_entry_id = k.id and t.type in ('lend', 'borrow')
);

-- Settled during the deploy: recorded with no account (a few minutes' window;
-- check_010.sql shows any balance this leaves out).
with copied as (
  select distinct user_id from public.accounts
  union
  select distinct user_id from public.transactions
)
insert into public.transactions (user_id, type, amount_paise, khata_entry_id, description,
                                 occurred_on, source, created_at, updated_at)
select k.user_id,
       case k.direction when 'lent' then 'repayment_received' else 'repayment_made' end,
       k.amount_paise, k.id, k.person,
       (k.settled_at at time zone 'Asia/Kolkata')::date, 'migration', k.settled_at, k.settled_at
from public.khata_entries k
join copied c on c.user_id = k.user_id
where k.settled_at is not null
  and not exists (
    select 1 from public.transactions t
    where t.khata_entry_id = k.id and t.type in ('repayment_received', 'repayment_made')
  );

update public.subscription_cycles sc
set transaction_id = t.id
from public.transactions t
where t.legacy_spend_id = sc.spend_id and sc.transaction_id is null;

commit;
