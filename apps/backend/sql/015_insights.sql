-- Intelligence (dashboard spec P4): A note from CUE and category learning.
--
-- note_log remembers when each note was shown or dismissed, so the same note
-- isn't shown again within 7 days (suggestion 19). merchant_categories holds
-- "Always put Zepto in Groceries?" answers (suggestion 18): new entries from
-- that merchant get that category.
--
-- Run in the Supabase SQL editor after 014_shared_money.sql, before deploying
-- the backend that uses it. Idempotent - safe to re-run.

begin;

create table if not exists public.note_log (
  user_id       uuid        not null references public.users (id) on delete cascade,
  -- e.g. "due:<item>:2026-11-18", "category:food_delivery:2026-11"
  note_key      text        not null check (char_length(note_key) between 1 and 120),
  last_shown_on date,
  dismissed_on  date,
  primary key (user_id, note_key)
);

create table if not exists public.merchant_categories (
  user_id    uuid        not null references public.users (id) on delete cascade,
  -- The merchant as CUE reads it from a description: its first word, lower case.
  merchant   text        not null check (char_length(merchant) between 1 and 40),
  kind       text        not null check (kind in ('expense', 'income')),
  category   text        not null check (category in (
    'food_delivery', 'groceries', 'transport', 'shopping', 'bills', 'subscriptions',
    'entertainment', 'health', 'education', 'travel', 'personal_care', 'other',
    'salary', 'business', 'freelance', 'interest', 'dividends', 'gifts', 'refunds')),
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant, kind)
);

alter table public.note_log enable row level security;
alter table public.merchant_categories enable row level security;

drop policy if exists note_log_select_own on public.note_log;
create policy note_log_select_own on public.note_log for select using (auth.uid() = user_id);
drop policy if exists merchant_categories_select_own on public.merchant_categories;
create policy merchant_categories_select_own on public.merchant_categories for select using (auth.uid() = user_id);

revoke all on table public.note_log, public.merchant_categories from anon, authenticated;

commit;
