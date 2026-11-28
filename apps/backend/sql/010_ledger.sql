-- Account ledger: accounts and one transactions table (dashboard spec P0, section 8).
--
-- Every figure on Today (balances, net worth, receivables, liabilities, the
-- month's numbers) is calculated by the backend from this ledger, by the date a
-- transaction happened (occurred_on), not the date it was entered.
--
-- Sign conventions
--   amount_paise is a positive magnitude; the type decides the direction.
--   Two exceptions are signed: 'opening' (a credit card opens negative, as money
--   due) and 'adjustment' (a reconcile can go either way, never zero).
--   A credit card account's balance is negative while money is due on it.
--
-- "Balance on" (spec suggestion 13)
--   An account's opening transaction is its balance as it stood on occurred_on.
--   A transaction moves the balance only if it is dated after the opening, or on
--   the same day and entered after it. A spend from last week added after setup
--   is then not subtracted twice (the double-count found in the 1.1.0 audit).
--
-- Copying existing data (step 5) keeps every user's bank and cash as they are
-- today, with one deliberate exception: spends dated before the latest balance
-- update but logged after it are no longer subtracted a second time.
-- Open Khata entries are copied with no account, so bank and cash do not move;
-- from here on they count in net worth (lent = asset, borrowed = liability).
--
-- The old tables are not changed or dropped; the old endpoints read the ledger.
-- Run in the Supabase SQL editor after 009. Idempotent - safe to re-run.
-- Checks: sql/check_010.sql.

begin;

-- 1. Accounts -----------------------------------------------------------------

create table if not exists public.accounts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  name        text        not null check (char_length(btrim(name)) between 1 and 40),
  kind        text        not null check (kind in ('savings', 'current', 'cash', 'credit_card', 'other')),
  -- Bank slug for the logo ("hdfc", "sbi", ...); null for cash or "Other".
  bank        text        check (bank is null or char_length(bank) <= 40),
  icon        text        check (icon is null or char_length(icon) <= 40),
  -- Archived only at a zero balance (suggestion 15); the backend enforces that.
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  -- Lets transactions reference (account, user) so an entry can only ever
  -- point at the same user's account.
  unique (id, user_id)
);

create index if not exists accounts_user_idx on public.accounts (user_id);

create unique index if not exists accounts_user_name_active_uidx
  on public.accounts (user_id, lower(btrim(name))) where archived_at is null;


-- 2. Transactions -------------------------------------------------------------

-- Same (id, user) key on Khata entries, for the same reason.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.khata_entries'::regclass and conname = 'khata_entries_id_user_key'
  ) then
    alter table public.khata_entries add constraint khata_entries_id_user_key unique (id, user_id);
  end if;
end $$;

create table if not exists public.transactions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.users (id) on delete cascade,
  -- Set by the app per entry: a retry or double tap never saves twice.
  client_key     uuid        not null default gen_random_uuid(),
  type           text        not null check (type in (
                   'opening', 'income', 'expense', 'transfer', 'refund', 'adjustment',
                   'lend', 'borrow', 'repayment_received', 'repayment_made'
                 )),
  amount_paise   bigint      not null check (abs(amount_paise) <= 10000000000),
  account_id     uuid,
  -- Transfers only: the account the money went to.
  to_account_id  uuid,
  category       text,
  description    text        check (description is null or char_length(btrim(description)) between 1 and 80),
  note           text        check (note is null or char_length(note) <= 120),
  -- Adjustments: why the balance was corrected.
  reason         text        check (reason is null or char_length(reason) <= 120),
  -- Lend, borrow and repayments: the Khata person record.
  khata_entry_id uuid,
  -- Refunds: the expense being refunded, when known (suggestion 26).
  refund_of      uuid,
  occurred_on    date        not null,
  source         text        not null default 'app' check (source in ('app', 'migration')),
  -- The spend this row was copied from, so old endpoints and subscription
  -- cycles can still find it.
  legacy_spend_id uuid       unique references public.spends (id) on delete set null,
  -- Delete is soft so the 5-second Undo can restore it; reads skip deleted rows.
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (user_id, client_key),
  unique (id, user_id),

  -- Every reference is to the same user's row (MATCH SIMPLE: a null id skips the check).
  constraint transactions_account_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint transactions_to_account_fk foreign key (to_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint transactions_khata_fk foreign key (khata_entry_id, user_id)
    references public.khata_entries (id, user_id) on delete cascade,
  constraint transactions_refund_fk foreign key (refund_of, user_id)
    references public.transactions (id, user_id) on delete set null (refund_of),

  constraint transactions_amount_sign check (
    case type
      when 'opening'    then true
      when 'adjustment' then amount_paise <> 0
      else amount_paise > 0
    end
  ),
  -- Only rows copied from the old tables may have no account (old Khata
  -- entries, and spends of users who never set a balance).
  constraint transactions_account_required check (
    account_id is not null or source = 'migration'
  ),
  constraint transactions_transfer_accounts check (
    (type = 'transfer') = (to_account_id is not null)
    and (to_account_id is null or to_account_id <> account_id)
  ),
  constraint transactions_khata_link check (
    (type in ('lend', 'borrow', 'repayment_received', 'repayment_made')) = (khata_entry_id is not null)
  ),
  constraint transactions_refund_link check (refund_of is null or type = 'refund'),
  -- Section 4.10 lists: 12 expense categories (refunds use the same ones) and
  -- 8 income categories. Other types carry no category.
  -- coalesce: a null category must fail, not pass as "unknown".
  constraint transactions_category check (coalesce(
    case type
      when 'expense' then category in (
        'food_delivery', 'groceries', 'transport', 'shopping', 'bills', 'subscriptions',
        'entertainment', 'health', 'education', 'travel', 'personal_care', 'other'
      )
      when 'refund' then category in (
        'food_delivery', 'groceries', 'transport', 'shopping', 'bills', 'subscriptions',
        'entertainment', 'health', 'education', 'travel', 'personal_care', 'other'
      )
      when 'income' then category in (
        'salary', 'business', 'freelance', 'interest', 'dividends', 'gifts', 'refunds', 'other'
      )
      else category is null
    end, false)
  )
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc) where deleted_at is null;
create index if not exists transactions_account_idx
  on public.transactions (account_id) where deleted_at is null;
create index if not exists transactions_to_account_idx
  on public.transactions (to_account_id) where to_account_id is not null;
create index if not exists transactions_khata_idx
  on public.transactions (khata_entry_id) where khata_entry_id is not null;

-- One live opening balance per account.
create unique index if not exists transactions_one_opening_uidx
  on public.transactions (account_id) where type = 'opening' and deleted_at is null;


-- 3. Subscription cycles can point at a ledger entry --------------------------

alter table public.subscription_cycles
  add column if not exists transaction_id uuid references public.transactions (id) on delete cascade;


-- 4. Lock the new tables down (same as 005) ------------------------------------

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select using (auth.uid() = user_id);

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);

revoke all on table public.accounts from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;


-- 4b. Atomic writes (called only by the backend with the secret key) ----------

-- Add account: the account and its opening balance in one step. The client key
-- belongs to the opening transaction; a retry with the same key returns the
-- account it already made. A credit card's opening is passed negative (money due).
create or replace function public.create_account(
  p_user       uuid,
  p_client_key uuid,
  p_name       text,
  p_kind       text,
  p_bank       text,
  p_icon       text,
  p_opening    bigint,
  p_balance_on date
) returns public.accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.accounts;
begin
  select a.* into v_account
  from public.transactions t join public.accounts a on a.id = t.account_id
  where t.user_id = p_user and t.client_key = p_client_key;
  if found then
    return v_account;
  end if;

  insert into public.accounts (user_id, name, kind, bank, icon)
  values (p_user, btrim(p_name), p_kind, p_bank, p_icon)
  returning * into v_account;

  insert into public.transactions (user_id, client_key, type, amount_paise, account_id,
                                   description, occurred_on)
  values (p_user, p_client_key, 'opening', p_opening, v_account.id,
          'Opening balance', p_balance_on);

  return v_account;
end;
$$;

revoke execute on function public.create_account(uuid, uuid, text, text, text, text, bigint, date)
  from public, anon, authenticated;
grant execute on function public.create_account(uuid, uuid, text, text, text, text, bigint, date)
  to service_role;


-- 5. Copy existing data, once per user -----------------------------------------
-- One DO block, so the working tables below live for the whole copy even
-- where an SQL editor runs each statement in its own transaction (the
-- Supabase editor does). They are dropped at the end.

do $copy$
begin
  -- Only users with no accounts and no ledger rows yet are copied, so a re-run
  -- does nothing. (A user who never set a balance gets ledger rows but no accounts.)
  -- Dates are taken in India time, where every current user is.

  drop table if exists _ledger_users;
  create temporary table _ledger_users as
  select u.id as user_id
  from public.users u
  where not exists (select 1 from public.accounts a where a.user_id = u.id)
    and not exists (select 1 from public.transactions t where t.user_id = u.id);

  -- The moment each user's typed balance was last true: the newest of set_at
  -- and the balance history (the same anchor GET /money/summary uses).
  drop table if exists _anchor;
  create temporary table _anchor as
  select s.user_id, s.bank_paise, s.cash_paise,
         greatest(s.set_at, coalesce(max(h.recorded_at), s.set_at)) as at
  from public.starting_money s
  join _ledger_users l on l.user_id = s.user_id
  left join public.balance_history h on h.user_id = s.user_id
  group by s.user_id, s.bank_paise, s.cash_paise, s.set_at;

  -- 5a. A Bank and a Cash account for everyone who set a balance.
  insert into public.accounts (user_id, name, kind, created_at)
  select user_id, 'Bank', 'savings', at from _anchor
  union all
  select user_id, 'Cash', 'cash', at from _anchor;

  drop table if exists _acct;
  create temporary table _acct as
  select a.user_id,
         max(a.id::text) filter (where a.kind = 'savings')::uuid as bank_id,
         max(a.id::text) filter (where a.kind = 'cash')::uuid    as cash_id
  from public.accounts a
  join _anchor n on n.user_id = a.user_id
  group by a.user_id;

  -- 5b. Opening balances, dated the day the balance was typed ("Balance on").
  insert into public.transactions (user_id, type, amount_paise, account_id, description,
                                   occurred_on, source, created_at, updated_at)
  select n.user_id, 'opening', n.bank_paise, c.bank_id, 'Opening balance',
         (n.at at time zone 'Asia/Kolkata')::date, 'migration', n.at, n.at
  from _anchor n join _acct c using (user_id)
  union all
  select n.user_id, 'opening', n.cash_paise, c.cash_id, 'Opening balance',
         (n.at at time zone 'Asia/Kolkata')::date, 'migration', n.at, n.at
  from _anchor n join _acct c using (user_id);

  -- 5c. Settled Khata entries for money borrowed logged a "Paid back to <name>"
  -- spend. Pair each such spend with its entry so it becomes a repayment, not
  -- spending: same user, amount, exact text and the entry's settle date.
  drop table if exists _paid_back;
  create temporary table _paid_back as
  select distinct on (s.id) s.id as spend_id, k.id as entry_id
  from public.spends s
  join _ledger_users l on l.user_id = s.user_id
  join public.khata_entries k
    on k.user_id = s.user_id
   and k.direction = 'borrowed'
   and k.settled_at is not null
   and k.amount_paise = s.amount_paise
   and s.category = 'other'
   and s.description in (
         'Paid back to ' || k.person,
         'Paid back to ' || k.person || ' in cash',
         'Paid back to ' || k.person || ' via UPI')
   and s.spent_on = (k.settled_at at time zone 'Asia/Kolkata')::date
  order by s.id, k.settled_at;

  -- 5d. Spends become expenses on Bank (no account if the user never set a
  -- balance). The row keeps the spend's id.
  insert into public.transactions (id, user_id, type, amount_paise, account_id, category,
                                   description, occurred_on, source, legacy_spend_id,
                                   created_at, updated_at)
  select s.id, s.user_id, 'expense', s.amount_paise, c.bank_id,
         case s.category
           when 'food'         then 'food_delivery'
           when 'fun'          then 'entertainment'
           when 'subscription' then 'subscriptions'
           else s.category
         end,
         s.description, s.spent_on, 'migration', s.id, s.created_at, s.created_at
  from public.spends s
  join _ledger_users l on l.user_id = s.user_id
  left join _acct c on c.user_id = s.user_id
  where not exists (select 1 from _paid_back p where p.spend_id = s.id);

  -- 5e. Khata: every entry is a lend or borrow with no account, so bank and cash
  -- stay as they are (the money left or arrived before the ledger existed).
  insert into public.transactions (user_id, type, amount_paise, khata_entry_id, description,
                                   note, occurred_on, source, created_at, updated_at)
  select k.user_id,
         case k.direction when 'lent' then 'lend' else 'borrow' end,
         k.amount_paise, k.id, k.person, k.note,
         (k.created_at at time zone 'Asia/Kolkata')::date, 'migration', k.created_at, k.created_at
  from public.khata_entries k
  join _ledger_users l on l.user_id = k.user_id;

  -- 5f. Settled lent entries: the money came back. Into Bank when settled after
  -- the balance was typed (the old summary added these); otherwise the typed
  -- balance already included it, so no account.
  insert into public.transactions (user_id, type, amount_paise, account_id, khata_entry_id,
                                   description, occurred_on, source, created_at, updated_at)
  select k.user_id, 'repayment_received', k.amount_paise,
         case when n.at is not null and k.settled_at > n.at then c.bank_id end,
         k.id, k.person,
         (k.settled_at at time zone 'Asia/Kolkata')::date, 'migration', k.settled_at, k.settled_at
  from public.khata_entries k
  join _ledger_users l on l.user_id = k.user_id
  left join _anchor n on n.user_id = k.user_id
  left join _acct c on c.user_id = k.user_id
  where k.direction = 'lent' and k.settled_at is not null;

  -- 5g. Settled borrowed entries: paid back. From Bank when the old app logged
  -- the "Paid back" spend (that spend is replaced by this row); otherwise no account.
  insert into public.transactions (id, user_id, type, amount_paise, account_id, khata_entry_id,
                                   description, occurred_on, source, legacy_spend_id,
                                   created_at, updated_at)
  select coalesce(s.id, gen_random_uuid()), k.user_id, 'repayment_made', k.amount_paise,
         case when s.id is not null then c.bank_id end,
         k.id, k.person,
         (k.settled_at at time zone 'Asia/Kolkata')::date, 'migration', s.id,
         coalesce(s.created_at, k.settled_at), coalesce(s.created_at, k.settled_at)
  from public.khata_entries k
  join _ledger_users l on l.user_id = k.user_id
  left join _paid_back p on p.entry_id = k.id
  left join public.spends s on s.id = p.spend_id
  left join _acct c on c.user_id = k.user_id
  where k.direction = 'borrowed' and k.settled_at is not null;

  -- 5h. Point logged subscription cycles at their ledger entry.
  update public.subscription_cycles sc
  set transaction_id = t.id
  from public.transactions t
  where t.legacy_spend_id = sc.spend_id and sc.transaction_id is null;

  drop table if exists _ledger_users, _anchor, _acct, _paid_back;
end
$copy$;

commit;
