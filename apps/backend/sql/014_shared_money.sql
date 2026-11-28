-- Shared money (dashboard spec P3): part payments and due dates for personal
-- Khata, and groups with shared expenses and settlements.
--
-- Group members are names the user types; they don't need CUE. Only the user's
-- side reaches the ledger, with the same types Khata uses (spec section 8):
--   I paid T, my share S    expense S + lend (T - S), both from my account
--   someone else paid       expense S + borrow S, no account moves
--   I receive a settlement  repayment_received into my account
--   I pay a settlement      repayment_made from my account
-- Group rows carry group_id instead of khata_entry_id, so personal and group
-- balances are counted separately and never twice.
--
-- Run in the Supabase SQL editor after 013_goal_jars.sql, before deploying the
-- backend that uses it. Idempotent - safe to re-run.

begin;

-- 1. Khata: due dates; settling pays what is still open ----------------------------

alter table public.khata_entries add column if not exists due_on date;

-- Settle in full: repays what is left after part payments (not the original amount).
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
  v_left  bigint;
begin
  update public.khata_entries set settled_at = now()
  where id = p_entry and user_id = p_user and settled_at is null
  returning * into v_entry;
  if not found then
    return null;
  end if;

  select v_entry.amount_paise - coalesce(sum(t.amount_paise), 0) into v_left
  from public.transactions t
  where t.khata_entry_id = v_entry.id and t.deleted_at is null
    and t.type in ('repayment_received', 'repayment_made');

  if v_left > 0 then
    insert into public.transactions (user_id, type, amount_paise, account_id, khata_entry_id,
                                     description, occurred_on, source)
    values (p_user,
            case v_entry.direction when 'lent' then 'repayment_received' else 'repayment_made' end,
            v_left, p_account, v_entry.id, v_entry.person, p_on,
            case when p_account is null then 'legacy' else 'app' end);
  end if;

  return v_entry;
end;
$$;

-- A payment between the user and one person, any amount (spec Settlement).
-- p_from_them: true when the person paid the user (reduces money lent), false
-- when the user paid them (reduces money borrowed). Open entries are paid oldest
-- first; fully paid ones are marked settled. Anything beyond what is open
-- becomes a new entry the other way (the person now owes, or is owed, the rest),
-- so every rupee that moved is on the ledger. A retry with the same client key
-- does nothing. Returns the amount that went beyond the open balance.
create or replace function public.settle_person(
  p_user       uuid,
  p_client_key uuid,
  p_person     text,
  p_from_them  boolean,
  p_amount     bigint,
  p_account    uuid,
  p_on         date
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left   bigint := p_amount;
  v_entry  record;
  v_pay    bigint;
  v_first  boolean := true;
  v_extra  public.khata_entries;
begin
  if exists (select 1 from public.transactions where user_id = p_user and client_key = p_client_key) then
    return 0;
  end if;

  for v_entry in
    select k.id, k.person, k.amount_paise - coalesce((
             select sum(t.amount_paise) from public.transactions t
             where t.khata_entry_id = k.id and t.deleted_at is null
               and t.type in ('repayment_received', 'repayment_made')), 0) as open_paise
    from public.khata_entries k
    where k.user_id = p_user and k.settled_at is null
      and lower(btrim(k.person)) = lower(btrim(p_person))
      and k.direction = case when p_from_them then 'lent' else 'borrowed' end
    order by k.created_at, k.id
  loop
    exit when v_left <= 0;
    continue when v_entry.open_paise <= 0;
    v_pay := least(v_left, v_entry.open_paise);
    insert into public.transactions (user_id, client_key, type, amount_paise, account_id,
                                     khata_entry_id, description, occurred_on, source)
    values (p_user,
            case when v_first then p_client_key else gen_random_uuid() end,
            case when p_from_them then 'repayment_received' else 'repayment_made' end,
            v_pay, p_account, v_entry.id, v_entry.person, p_on, 'app');
    v_first := false;
    if v_pay = v_entry.open_paise then
      update public.khata_entries set settled_at = now() where id = v_entry.id;
    end if;
    v_left := v_left - v_pay;
  end loop;

  if v_left > 0 then
    insert into public.khata_entries (user_id, direction, person, amount_paise, note)
    values (p_user, case when p_from_them then 'borrowed' else 'lent' end, btrim(p_person), v_left,
            'Paid more than was owed')
    returning * into v_extra;
    insert into public.transactions (user_id, client_key, type, amount_paise, account_id,
                                     khata_entry_id, description, occurred_on, source)
    values (p_user,
            case when v_first then p_client_key else gen_random_uuid() end,
            case when p_from_them then 'borrow' else 'lend' end,
            v_left, p_account, v_extra.id, v_extra.person, p_on, 'app');
  end if;

  return v_left;
end;
$$;


-- 2. Groups, members, expenses, shares, settlements ---------------------------------

create table if not exists public.groups (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  client_key  uuid        not null,
  name        text        not null check (char_length(btrim(name)) between 1 and 40),
  icon        text        not null check (char_length(icon) between 1 and 8),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, client_key),
  unique (id, user_id)
);

create table if not exists public.group_members (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  group_id   uuid        not null,
  name       text        not null check (char_length(btrim(name)) between 1 and 40),
  -- The user themself; exactly one per group.
  is_me      boolean     not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint group_members_group_fk foreign key (group_id, user_id)
    references public.groups (id, user_id) on delete cascade
);

create unique index if not exists group_members_name_uidx
  on public.group_members (group_id, lower(btrim(name))) where removed_at is null;
create unique index if not exists group_members_me_uidx
  on public.group_members (group_id) where is_me;

create table if not exists public.group_expenses (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  client_key   uuid        not null,
  group_id     uuid        not null,
  description  text        not null check (char_length(btrim(description)) between 1 and 80),
  category     text        not null check (category in (
    'food_delivery', 'groceries', 'transport', 'shopping', 'bills', 'subscriptions',
    'entertainment', 'health', 'education', 'travel', 'personal_care', 'other')),
  amount_paise bigint      not null check (amount_paise between 1 and 10000000000),
  paid_by      uuid        not null,
  split        text        not null check (split in ('equal', 'exact')),
  occurred_on  date        not null,
  note         text        check (note is null or char_length(note) <= 120),
  -- The user's account when they paid; null when someone else did.
  account_id   uuid,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, client_key),
  unique (id, user_id),
  constraint group_expenses_group_fk foreign key (group_id, user_id)
    references public.groups (id, user_id) on delete cascade,
  constraint group_expenses_payer_fk foreign key (paid_by, user_id)
    references public.group_members (id, user_id) on delete restrict,
  constraint group_expenses_account_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict
);

create table if not exists public.group_expense_shares (
  expense_id  uuid   not null references public.group_expenses (id) on delete cascade,
  member_id   uuid   not null references public.group_members (id) on delete restrict,
  share_paise bigint not null check (share_paise between 0 and 10000000000),
  primary key (expense_id, member_id)
);

create table if not exists public.group_settlements (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  client_key   uuid        not null,
  group_id     uuid        not null,
  from_member  uuid        not null,
  to_member    uuid        not null check (to_member <> from_member),
  amount_paise bigint      not null check (amount_paise between 1 and 10000000000),
  occurred_on  date        not null,
  note         text        check (note is null or char_length(note) <= 120),
  -- The user's account when they paid or were paid; null between two others.
  account_id   uuid,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, client_key),
  unique (id, user_id),
  constraint group_settlements_group_fk foreign key (group_id, user_id)
    references public.groups (id, user_id) on delete cascade,
  constraint group_settlements_from_fk foreign key (from_member, user_id)
    references public.group_members (id, user_id) on delete restrict,
  constraint group_settlements_to_fk foreign key (to_member, user_id)
    references public.group_members (id, user_id) on delete restrict,
  constraint group_settlements_account_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict
);

create index if not exists groups_user_idx on public.groups (user_id);
create index if not exists group_members_group_idx on public.group_members (group_id);
create index if not exists group_expenses_group_idx on public.group_expenses (group_id);
create index if not exists group_settlements_group_idx on public.group_settlements (group_id);


-- 3. The user's side on the ledger ---------------------------------------------------

alter table public.transactions add column if not exists group_id uuid;
alter table public.transactions add column if not exists group_expense_id uuid;
alter table public.transactions add column if not exists group_settlement_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_group_fk') then
    alter table public.transactions add constraint transactions_group_fk
      foreign key (group_id, user_id) references public.groups (id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_group_expense_fk') then
    alter table public.transactions add constraint transactions_group_expense_fk
      foreign key (group_expense_id, user_id) references public.group_expenses (id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_group_settlement_fk') then
    alter table public.transactions add constraint transactions_group_settlement_fk
      foreign key (group_settlement_id, user_id) references public.group_settlements (id, user_id) on delete cascade;
  end if;
end $$;

create index if not exists transactions_group_idx on public.transactions (group_id) where group_id is not null;

-- Lend, borrow and repayments belong to a Khata entry or to a group; only those
-- types have a Khata entry. (A group's "your share" row is an expense with a
-- group and no Khata entry.)
alter table public.transactions drop constraint if exists transactions_khata_link;
alter table public.transactions add constraint transactions_khata_link check (
  (khata_entry_id is null or type in ('lend', 'borrow', 'repayment_received', 'repayment_made'))
  and (type not in ('lend', 'borrow', 'repayment_received', 'repayment_made')
       or khata_entry_id is not null or group_id is not null)
  and not (khata_entry_id is not null and group_id is not null)
);

-- Group rows: only expenses and the Khata types, always from a group expense or settlement.
alter table public.transactions drop constraint if exists transactions_group_link;
alter table public.transactions add constraint transactions_group_link check (
  group_id is null
  or (type in ('expense', 'lend', 'borrow', 'repayment_received', 'repayment_made')
      and (group_expense_id is not null) <> (group_settlement_id is not null))
);

-- Someone else paying moves none of the user's accounts: their share and what
-- they owe have no account.
alter table public.transactions drop constraint if exists transactions_account_required;
alter table public.transactions add constraint transactions_account_required check (
  account_id is not null
  or source in ('migration', 'legacy')
  or (group_expense_id is not null and type in ('expense', 'borrow'))
);


-- 4. Writing a group expense or settlement with its ledger rows, atomically ---------
-- The backend works out the shares and the ledger rows (app/features/money/groups.py)
-- and passes them in; these functions only store them together.

-- Create (p_expense has no id) or replace (it has one) an expense, its shares and
-- its ledger rows. A retry of a create with the same client key returns the row
-- already made. Returns null when the expense to replace is missing or deleted.
create or replace function public.put_group_expense(
  p_user    uuid,
  p_expense jsonb,
  p_shares  jsonb,
  p_txns    jsonb
) returns public.group_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.group_expenses;
  v_txn jsonb;
begin
  if p_expense->>'id' is null then
    select * into v_row from public.group_expenses
    where user_id = p_user and client_key = (p_expense->>'client_key')::uuid;
    if found then
      return v_row;
    end if;
    insert into public.group_expenses (user_id, client_key, group_id, description, category, amount_paise,
                                       paid_by, split, occurred_on, note, account_id)
    values (p_user, (p_expense->>'client_key')::uuid, (p_expense->>'group_id')::uuid,
            btrim(p_expense->>'description'), p_expense->>'category', (p_expense->>'amount_paise')::bigint,
            (p_expense->>'paid_by')::uuid, p_expense->>'split', (p_expense->>'occurred_on')::date,
            nullif(p_expense->>'note', ''), (p_expense->>'account_id')::uuid)
    returning * into v_row;
  else
    update public.group_expenses set
      description = btrim(p_expense->>'description'),
      category = p_expense->>'category',
      amount_paise = (p_expense->>'amount_paise')::bigint,
      paid_by = (p_expense->>'paid_by')::uuid,
      split = p_expense->>'split',
      occurred_on = (p_expense->>'occurred_on')::date,
      note = nullif(p_expense->>'note', ''),
      account_id = (p_expense->>'account_id')::uuid,
      updated_at = now()
    where id = (p_expense->>'id')::uuid and user_id = p_user and deleted_at is null
    returning * into v_row;
    if not found then
      return null;
    end if;
    delete from public.group_expense_shares where expense_id = v_row.id;
    delete from public.transactions where group_expense_id = v_row.id and user_id = p_user;
  end if;

  insert into public.group_expense_shares (expense_id, member_id, share_paise)
  select v_row.id, (s->>'member_id')::uuid, (s->>'share_paise')::bigint
  from jsonb_array_elements(p_shares) s;

  for v_txn in select * from jsonb_array_elements(p_txns) loop
    insert into public.transactions (user_id, type, amount_paise, account_id, category, description,
                                     occurred_on, source, group_id, group_expense_id)
    values (p_user, v_txn->>'type', (v_txn->>'amount_paise')::bigint, (v_txn->>'account_id')::uuid,
            v_txn->>'category', v_txn->>'description', v_row.occurred_on, 'app',
            v_row.group_id, v_row.id);
  end loop;

  return v_row;
end;
$$;

-- A settlement and, when the user paid or was paid, its ledger row.
create or replace function public.put_group_settlement(
  p_user       uuid,
  p_settlement jsonb,
  p_txns       jsonb
) returns public.group_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.group_settlements;
  v_txn jsonb;
begin
  select * into v_row from public.group_settlements
  where user_id = p_user and client_key = (p_settlement->>'client_key')::uuid;
  if found then
    return v_row;
  end if;
  insert into public.group_settlements (user_id, client_key, group_id, from_member, to_member,
                                        amount_paise, occurred_on, note, account_id)
  values (p_user, (p_settlement->>'client_key')::uuid, (p_settlement->>'group_id')::uuid,
          (p_settlement->>'from_member')::uuid, (p_settlement->>'to_member')::uuid,
          (p_settlement->>'amount_paise')::bigint, (p_settlement->>'occurred_on')::date,
          nullif(p_settlement->>'note', ''), (p_settlement->>'account_id')::uuid)
  returning * into v_row;

  for v_txn in select * from jsonb_array_elements(p_txns) loop
    insert into public.transactions (user_id, type, amount_paise, account_id, description,
                                     occurred_on, source, group_id, group_settlement_id)
    values (p_user, v_txn->>'type', (v_txn->>'amount_paise')::bigint, (v_txn->>'account_id')::uuid,
            v_txn->>'description', v_row.occurred_on, 'app', v_row.group_id, v_row.id);
  end loop;
  return v_row;
end;
$$;

-- Delete (p_deleted true) or Undo (false) an expense or settlement with its ledger rows.
create or replace function public.set_group_entry_deleted(
  p_user    uuid,
  p_kind    text,
  p_id      uuid,
  p_deleted boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stamp timestamptz := case when p_deleted then now() end;
begin
  if p_kind = 'expense' then
    update public.group_expenses set deleted_at = v_stamp
    where id = p_id and user_id = p_user and (deleted_at is null) = p_deleted;
    if not found then
      return false;
    end if;
    update public.transactions set deleted_at = v_stamp where group_expense_id = p_id and user_id = p_user;
  elsif p_kind = 'settlement' then
    update public.group_settlements set deleted_at = v_stamp
    where id = p_id and user_id = p_user and (deleted_at is null) = p_deleted;
    if not found then
      return false;
    end if;
    update public.transactions set deleted_at = v_stamp where group_settlement_id = p_id and user_id = p_user;
  else
    return false;
  end if;
  return true;
end;
$$;


-- 5. Lock everything down (same as the ledger) ----------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_expenses enable row level security;
alter table public.group_expense_shares enable row level security;
alter table public.group_settlements enable row level security;

drop policy if exists groups_select_own on public.groups;
create policy groups_select_own on public.groups for select using (auth.uid() = user_id);
drop policy if exists group_members_select_own on public.group_members;
create policy group_members_select_own on public.group_members for select using (auth.uid() = user_id);
drop policy if exists group_expenses_select_own on public.group_expenses;
create policy group_expenses_select_own on public.group_expenses for select using (auth.uid() = user_id);
drop policy if exists group_settlements_select_own on public.group_settlements;
create policy group_settlements_select_own on public.group_settlements for select using (auth.uid() = user_id);

revoke all on table public.groups, public.group_members, public.group_expenses,
  public.group_expense_shares, public.group_settlements from anon, authenticated;

revoke execute on function
  public.settle_person(uuid, uuid, text, boolean, bigint, uuid, date),
  public.put_group_expense(uuid, jsonb, jsonb, jsonb),
  public.put_group_settlement(uuid, jsonb, jsonb),
  public.set_group_entry_deleted(uuid, text, uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.settle_person(uuid, uuid, text, boolean, bigint, uuid, date),
  public.put_group_expense(uuid, jsonb, jsonb, jsonb),
  public.put_group_settlement(uuid, jsonb, jsonb),
  public.set_group_entry_deleted(uuid, text, uuid, boolean)
to service_role;

commit;
