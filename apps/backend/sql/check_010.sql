-- Read-only checks for 010_ledger.sql. Changes nothing; safe to run any time.
--
-- One row per user who set a balance:
--   old_balance      bank + cash as GET /money/summary computes it before 010
--   ledger_balance   bank + cash from the ledger (the "Balance on" rule)
--   double_counted   spends dated before the balance update but logged after it;
--                    the old formula subtracted these a second time
--   ok               ledger_balance = old_balance + double_counted
-- Every row should say ok = true. Any false row: stop and investigate.
--
-- Run it after 010 and 011, BEFORE deploying the backend that writes to the
-- ledger. Once the new backend has recorded Khata settlements or balance
-- updates, the old formula no longer applies and false rows are expected.

with anchor as (
  select s.user_id, s.bank_paise + s.cash_paise as typed,
         greatest(s.set_at, coalesce(max(h.recorded_at), s.set_at)) as at
  from public.starting_money s
  left join public.balance_history h on h.user_id = s.user_id
  group by s.user_id, s.bank_paise, s.cash_paise, s.set_at
),
old as (
  select a.user_id,
         a.typed
         - coalesce((select sum(sp.amount_paise) from public.spends sp
                     where sp.user_id = a.user_id and sp.created_at > a.at), 0)
         + coalesce((select sum(k.amount_paise) from public.khata_entries k
                     where k.user_id = a.user_id and k.direction = 'lent'
                       and k.settled_at > a.at), 0) as balance,
         coalesce((select sum(sp.amount_paise) from public.spends sp
                   where sp.user_id = a.user_id and sp.created_at > a.at
                     and sp.spent_on < (a.at at time zone 'Asia/Kolkata')::date), 0) as double_counted
  from anchor a
),
opening as (
  select account_id, amount_paise, occurred_on, created_at
  from public.transactions
  where type = 'opening' and deleted_at is null
),
-- Each transaction's effect on each account it touches.
effect as (
  select t.user_id, t.account_id, t.occurred_on, t.created_at,
         case
           when t.type in ('income', 'refund', 'borrow', 'repayment_received', 'adjustment') then t.amount_paise
           when t.type in ('expense', 'lend', 'repayment_made', 'transfer') then -t.amount_paise
           else 0
         end as delta
  from public.transactions t
  where t.deleted_at is null and t.type <> 'opening' and t.account_id is not null
  union all
  select t.user_id, t.to_account_id, t.occurred_on, t.created_at, t.amount_paise
  from public.transactions t
  where t.deleted_at is null and t.type = 'transfer'
),
ledger as (
  select ac.user_id,
         sum(o.amount_paise
             + coalesce((select sum(e.delta) from effect e
                         where e.account_id = ac.id
                           and (e.occurred_on, e.created_at) > (o.occurred_on, o.created_at)), 0)) as balance
  from public.accounts ac
  join opening o on o.account_id = ac.id
  where ac.kind <> 'credit_card'
  group by ac.user_id
)
select o.user_id, o.balance as old_balance, l.balance as ledger_balance, o.double_counted,
       l.balance is not distinct from o.balance + o.double_counted as ok
from old o
left join ledger l on l.user_id = o.user_id
order by ok, o.user_id;

-- Counts: every spend and Khata entry should appear in the ledger.
select
  (select count(*) from public.spends)                                     as spends,
  (select count(*) from public.transactions where type = 'expense' and source = 'migration')
    + (select count(*) from public.transactions where type = 'repayment_made' and legacy_spend_id is not null)
                                                                           as spends_in_ledger,
  (select count(*) from public.khata_entries)                              as khata_entries,
  (select count(*) from public.transactions where type in ('lend', 'borrow'))
                                                                           as khata_in_ledger;
