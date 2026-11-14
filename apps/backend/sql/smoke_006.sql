-- Smoke test for 006_money_spec.sql. Run after 006 in the SQL editor or psql.
-- Everything happens inside one transaction that is rolled back: nothing is kept.
-- Any failed assertion raises an exception and aborts the run.

begin;

insert into public.users (id, email, full_name, is_active, has_completed_assessment, archetype, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'smoke-a@example.invalid', 'Smoke A', true, false, 'unassessed', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'smoke-b@example.invalid', 'Smoke B', true, false, 'unassessed', now(), now())
on conflict (id) do nothing;

insert into public.subscriptions (id, user_id, name, amount_paise, billing_day, starts_on)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Netflix', 19900, 10, '2020-01-01'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gym', 50000, 31, '2020-01-01');


-- 1. Answering the same month twice logs once --------------------------------
do $$
declare n int; r1 boolean; r2 boolean;
begin
  r1 := public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', '2024-03-01', true);
  r2 := public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', '2024-03-01', true);
  if not (r1 and r2) then raise exception 'double answer: both calls should return true'; end if;
  select count(*) into n from public.spends
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'Netflix' and spent_on = '2024-03-10';
  if n <> 1 then raise exception 'double answer: expected 1 spend, got %', n; end if;
  select count(*) into n from public.subscription_cycles
    where subscription_id = 'a0000000-0000-4000-8000-000000000001' and month = '2024-03-01' and status = 'logged';
  if n <> 1 then raise exception 'double answer: expected 1 cycle, got %', n; end if;
end $$;


-- 2. Wrong user: false, nothing changes --------------------------------------
do $$
declare n int; r boolean;
begin
  r := public.answer_subscription_cycle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000001', '2024-04-01', false);
  if r is not false then raise exception 'wrong user: expected false, got %', r; end if;
  select count(*) into n from public.subscription_cycles
    where subscription_id = 'a0000000-0000-4000-8000-000000000001' and month = '2024-04-01';
  if n <> 0 then raise exception 'wrong user: a cycle was written'; end if;
  if not (select active from public.subscriptions where id = 'a0000000-0000-4000-8000-000000000001') then
    raise exception 'wrong user: subscription was deactivated';
  end if;
end $$;


-- 3. No deactivates -----------------------------------------------------------
do $$
declare n int;
begin
  perform public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', '2024-04-01', false);
  if (select active from public.subscriptions where id = 'a0000000-0000-4000-8000-000000000002') then
    raise exception 'No: subscription should be inactive';
  end if;
  select count(*) into n from public.subscription_cycles
    where subscription_id = 'a0000000-0000-4000-8000-000000000002' and month = '2024-04-01' and status = 'skipped';
  if n <> 1 then raise exception 'No: expected 1 skipped cycle, got %', n; end if;
  select count(*) into n from public.spends
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'Gym';
  if n <> 0 then raise exception 'No: no spend should be logged'; end if;

  -- An inactive subscription answers true and does nothing.
  if public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', '2024-05-01', true) is not true then
    raise exception 'inactive: expected true';
  end if;
  select count(*) into n from public.subscription_cycles
    where subscription_id = 'a0000000-0000-4000-8000-000000000002' and month = '2024-05-01';
  if n <> 0 then raise exception 'inactive: a cycle was written'; end if;
end $$;

-- Reactivate Gym for the billing-day tests.
update public.subscriptions set active = true where id = 'a0000000-0000-4000-8000-000000000002';


-- 4. Billing day 31 clamps to the month's last day, in leap and common years --
do $$
begin
  perform public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', '2024-02-01', true);
  perform public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', '2023-02-01', true);
  perform public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', '2023-03-01', true);
  if not exists (select 1 from public.spends where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'Gym' and spent_on = '2024-02-29') then
    raise exception 'Feb 2024 should log 29 Feb';
  end if;
  if not exists (select 1 from public.spends where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'Gym' and spent_on = '2023-02-28') then
    raise exception 'Feb 2023 should log 28 Feb';
  end if;
  if not exists (select 1 from public.spends where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'Gym' and spent_on = '2023-03-31') then
    raise exception 'Mar 2023 should log 31 Mar (no drift)';
  end if;
end $$;


-- 5. Months that cannot be answered are no-ops --------------------------------
do $$
declare n int;
begin
  -- before starts_on's month (2020-01) and in the future
  perform public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', '2019-12-01', true);
  perform public.answer_subscription_cycle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', (date_trunc('month', current_date) + interval '2 months')::date, true);
  select count(*) into n from public.subscription_cycles
    where subscription_id = 'a0000000-0000-4000-8000-000000000002'
      and (month = '2019-12-01' or month > current_date + 1);
  if n <> 0 then raise exception 'out-of-range months must not write cycles, got %', n; end if;
end $$;


-- 6. Reuse path updates amount and day and does not duplicate -----------------
do $$
declare n int; s public.subscriptions;
begin
  perform public.log_subscription_spend('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hulu', 10000, '2024-05-06', 6);
  perform public.log_subscription_spend('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  hulu ', 20000, '2024-06-07', 9);
  select count(*) into n from public.subscriptions
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and lower(btrim(name)) = 'hulu';
  if n <> 1 then raise exception 'reuse: expected 1 subscription, got %', n; end if;
  select * into s from public.subscriptions
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and lower(btrim(name)) = 'hulu';
  if s.amount_paise <> 20000 or s.billing_day <> 9 then
    raise exception 'reuse: expected 20000/9, got %/%', s.amount_paise, s.billing_day;
  end if;
  select count(*) into n from public.subscription_cycles where subscription_id = s.id and status = 'logged';
  if n <> 2 then raise exception 'reuse: expected 2 logged cycles, got %', n; end if;
end $$;

-- The unique index refuses a second active row with the same name.
do $$
begin
  begin
    insert into public.subscriptions (user_id, name, amount_paise, billing_day, starts_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ' NETFLIX ', 1, 1, '2024-01-01');
    raise exception 'unique index: duplicate active name was accepted';
  exception when unique_violation then
    null;
  end;
end $$;


-- 7. Deleting a Yes-logged spend re-opens the month ---------------------------
do $$
declare n int;
begin
  delete from public.spends
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'Netflix' and spent_on = '2024-03-10';
  select count(*) into n from public.subscription_cycles
    where subscription_id = 'a0000000-0000-4000-8000-000000000001' and month = '2024-03-01';
  if n <> 0 then raise exception 'delete spend: cycle should be gone, got %', n; end if;
end $$;


-- 8. balance_history: one row per real change ---------------------------------
do $$
declare n int;
begin
  insert into public.starting_money (user_id, bank_paise, cash_paise)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100, 50);
  select count(*) into n from public.balance_history where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'history: insert should append 1, got %', n; end if;

  update public.starting_money set bank_paise = 100, cash_paise = 50
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  select count(*) into n from public.balance_history where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'history: unchanged update should not append, got %', n; end if;

  update public.starting_money set bank_paise = 200 where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  select count(*) into n from public.balance_history where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if n <> 2 then raise exception 'history: changed update should append, got %', n; end if;
end $$;

rollback;
