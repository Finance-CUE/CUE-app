import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  barLayout,
  bucketIndexOf,
  bucketLabel,
  historyNote,
  linePath,
  nearestIndex,
  runningRemaining,
  stripText,
} from './charts/model.ts';
import {
  leftToSpendLine,
  monthEyebrow,
  overspendLine,
  tiles,
  vsLastMonth,
} from './month/model.ts';
import {
  calendarWeeks,
  comingUp,
  dueOn,
  groupByKind,
  metaLine,
  monthTotal,
  shiftMonth,
  statusPill,
  validateSchedule,
} from './scheduled/model.ts';
import { nextRepeatDate, scheduleKindFor, scheduledLabel, validate } from './quickAdd/model.ts';
import { applyFilters } from './transactions/model.ts';
import type { Account, CashFlowBucket, LedgerTxn, MonthSummary, Occurrence } from './types.ts';

const fmt = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

const MONTH: MonthSummary = {
  month: '2026-11-01',
  income_paise: 35_000_00,
  salary_paise: 30_000_00,
  other_income_paise: 5_000_00,
  expenses_paise: 18_000_00,
  daily_average_paise: 1_125_00,
  expenses_same_days_last_month_paise: 16_800_00,
  savings_paise: 17_000_00,
  savings_rate: 49,
  dues_paise: 4_000_00,
  dues_count: 3,
  categories: [],
  left_to_spend: null,
};

// This month (4.4) ------------------------------------------------------------------------

test('tiles read as the spec example', () => {
  const [income, expenses, savings, dues] = tiles(MONTH, fmt);
  assert.equal(monthEyebrow(MONTH.month), 'THIS MONTH · NOVEMBER');
  assert.equal(income.sub, 'Salary ₹30,000 · Other ₹5,000');
  assert.equal(expenses.sub, '₹1,125 a day on average');
  assert.equal(savings.sub, '49% of income saved');
  assert.equal(dues.sub, '3 payments before 30 Nov');
  assert.equal(income.quickAdd, null);
});

test('empty tiles hint and open Quick Add; no income never divides by zero', () => {
  const empty = { ...MONTH, income_paise: 0, salary_paise: 0, other_income_paise: 0, expenses_paise: 2_000_00,
    savings_paise: -2_000_00, savings_rate: null, dues_paise: 0, dues_count: 0 }; // prettier-ignore
  const [income, expenses, savings, dues] = tiles(empty, fmt);
  assert.deepEqual([income.sub, income.quickAdd], ['Add income', 'income']);
  assert.equal(expenses.quickAdd, null);
  assert.equal(savings.amount, '−₹2,000');
  assert.equal(savings.sub, 'Add income to see your savings rate');
  assert.equal(dues.sub, 'Nothing more due this month');
  assert.equal(overspendLine(empty, fmt), 'You spent ₹2,000 more than came in this month');
  assert.equal(overspendLine(MONTH, fmt), null);
  const none = tiles({ ...empty, expenses_paise: 0 }, fmt)[1];
  assert.deepEqual([none.sub, none.quickAdd], ['No spends yet', 'expense']);
});

test('comparison and left-to-spend lines use words and arrows', () => {
  assert.equal(vsLastMonth(18_000_00, 16_800_00, fmt), '↑ ₹1,200 vs same days last month');
  assert.equal(vsLastMonth(100, 300, fmt), '↓ ₹2 vs same days last month');
  assert.equal(leftToSpendLine(MONTH, fmt), null);
  const lts = { per_day_paise: 1_240_00, free_paise: 0, dues_before_paise: 0, next_salary_on: '2026-12-01' };
  assert.equal(leftToSpendLine({ ...MONTH, left_to_spend: lts }, fmt), '₹1,240 free to spend today');
  assert.equal(
    leftToSpendLine({ ...MONTH, left_to_spend: { ...lts, per_day_paise: -5 } }, fmt),
    'Dues before payday take all your free balance',
  );
});

// Coming up (4.8) ---------------------------------------------------------------------------

const occ = (over: Partial<Occurrence>): Occurrence => ({
  schedule_id: 's', kind: 'subscription', name: 'Netflix', amount_paise: 199_00, frequency: 'monthly',
  account_id: 'a1', category: null, variable: false, reminder: true, due_on: '2026-11-18', status: 'due',
  transaction_id: null, ...over,
}); // prettier-ignore

test('status pills follow the spec bands', () => {
  const today = '2026-11-16';
  assert.deepEqual(statusPill('2026-11-25', today), { label: '25 Nov', tone: 'line' });
  assert.deepEqual(statusPill('2026-11-18', today), { label: 'In 2 days', tone: 'soft' });
  assert.deepEqual(statusPill('2026-11-19', today), { label: 'In 3 days', tone: 'soft' });
  assert.deepEqual(statusPill('2026-11-17', today), { label: 'Tomorrow', tone: 'soft' });
  assert.deepEqual(statusPill(today, today), { label: 'Today', tone: 'solid' });
  assert.deepEqual(statusPill('2026-11-01', today), { label: 'Check', tone: 'check' });
});

test('coming up: next four unpaid payments, overdue first, income left out', () => {
  const today = '2026-11-16';
  const list = [
    occ({ name: 'Rent', due_on: '2026-12-01', kind: 'rent' }),
    occ({ name: 'Old bill', due_on: '2026-11-01', kind: 'bill' }),
    occ({ name: 'Salary', due_on: '2026-11-20', kind: 'income' }),
    occ({ name: 'Paid', due_on: '2026-11-17', status: 'paid' }),
    occ({ name: 'Far', due_on: '2026-12-20' }),
    occ({ name: 'Netflix', due_on: '2026-11-18' }),
    occ({ name: 'Prime', due_on: '2026-11-20' }),
    occ({ name: 'Gym', due_on: '2026-11-25' }),
  ];
  assert.deepEqual(comingUp(list, today).map((o) => o.name), ['Old bill', 'Netflix', 'Prime', 'Gym']);
  assert.deepEqual(dueOn(list, '2026-11-20').map((o) => o.name), ['Prime']);
  assert.deepEqual(groupByKind(list).map((g) => g.label), ['Subscriptions', 'Bills', 'Rent']);
});

test('meta line and calendar', () => {
  const accounts = new Map<string, Account>([['a1', { id: 'a1', name: 'HDFC' } as Account]]);
  assert.equal(metaLine(occ({}), accounts), 'HDFC · Monthly · 🔔');
  assert.equal(metaLine(occ({ reminder: false, frequency: 'yearly', account_id: null }), accounts), 'Yearly');
  const weeks = calendarWeeks('2026-11-01', [occ({ due_on: '2026-11-18' })]);
  assert.equal(weeks[0][0].iso, '2026-10-26'); // Monday before 1 Nov (a Sunday)
  assert.equal(weeks.flat().filter((d) => d.inMonth).length, 30);
  assert.equal(weeks.flat().find((d) => d.iso === '2026-11-18')?.dues.length, 1);
  assert.equal(monthTotal([occ({}), occ({ status: 'skipped' }), occ({ status: 'paid' }), occ({ kind: 'income' })]), 398_00);
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
});

test('schedule form errors sit under fields', () => {
  assert.deepEqual(validateSchedule({ name: ' ', amountPaise: 0, nextOn: null, accountId: null }), {
    name: 'Give it a name.', amount: 'Enter an amount above ₹0.', date: 'Enter a date as DD/MM/YYYY.',
    account: 'Choose an account.',
  }); // prettier-ignore
  assert.deepEqual(validateSchedule({ name: 'Rent', amountPaise: 1, nextOn: '2026-12-01', accountId: 'a' }), {});
});

// Charts (4.6, 4.3) -------------------------------------------------------------------------

const bucket = (start: string, end: string, income: number, expenses: number, count = 1): CashFlowBucket => ({
  start, end, income_paise: income, expenses_paise: expenses, count,
}); // prettier-ignore

test('cash flow labels, strip and running remaining', () => {
  const wed = bucket('2026-11-12', '2026-11-12', 0, 1_310_00, 3);
  assert.equal(bucketLabel(wed, 'week'), 'Thu');
  assert.equal(bucketLabel(bucket('2026-11-09', '2026-11-09', 0, 0), 'week'), 'Mon');
  assert.equal(bucketLabel(bucket('2026-11-02', '2026-11-08', 0, 0), 'month'), '2–8');
  assert.equal(bucketLabel(bucket('2026-09-01', '2026-09-30', 0, 0), 'quarter'), 'Sep');
  assert.equal(stripText(wed, 'week', fmt), 'Thu 12 Nov · Spent ₹1,310 · 3 transactions');
  assert.equal(stripText(bucket('2026-11-02', '2026-11-08', 500_00, 0, 1), 'month', fmt),
    '2 Nov – 8 Nov · Spent ₹0 · Received ₹500 · 1 transaction'); // prettier-ignore
  assert.deepEqual(runningRemaining([bucket('a', 'a', 100, 30), bucket('b', 'b', 0, 50)]), [70, 20]);
  const buckets = [bucket('2026-11-09', '2026-11-09', 0, 0), bucket('2026-11-10', '2026-11-16', 0, 0)];
  assert.equal(bucketIndexOf(buckets, '2026-11-12'), 1);
  assert.equal(bucketIndexOf(buckets, '2026-11-30'), -1);
});

test('bars scale to the tallest value and show small amounts', () => {
  const [a, b] = barLayout([bucket('a', 'a', 1000, 10), bucket('b', 'b', 0, 500)], 100, 50);
  assert.equal(a.incomeH, 50);
  assert.equal(a.expenseH, 3); // tiny but visible
  assert.equal(b.incomeH, 0);
  assert.equal(b.x, 50);
});

test('net worth chart: history note, touch and path', () => {
  const h = { points: [], history_starts: '2026-09-14' };
  assert.equal(historyNote(h, 365, '2026-11-16'), 'History starts 14 Sep');
  assert.equal(historyNote(h, 30, '2026-11-16'), null);
  assert.equal(historyNote({ points: [], history_starts: null }, 30, '2026-11-16'), null);
  assert.equal(nearestIndex(0, 300, 30), 0);
  assert.equal(nearestIndex(300, 300, 30), 29);
  assert.equal(nearestIndex(151, 300, 3), 1);
  assert.equal(nearestIndex(-20, 300, 3), 0);
  const { line, area } = linePath([1, 3], 100, 50, 0);
  assert.equal(line, 'M0.0,50.0 L100.0,0.0');
  assert.ok(area.endsWith('Z'));
});

// Quick Add: recurring and future entries --------------------------------------------------


test('a repeat lands one, three or twelve months on, clamped to short months', () => {
  assert.equal(nextRepeatDate('2026-11-01', 'monthly'), '2026-12-01');
  assert.equal(nextRepeatDate('2027-01-31', 'monthly'), '2027-02-28');
  assert.equal(nextRepeatDate('2026-11-30', 'quarterly'), '2027-02-28');
  assert.equal(nextRepeatDate('2028-02-29', 'yearly'), '2029-02-28');
});

test('future dates: allowed for new income and expenses, never for transfers or edits', () => {
  const base = { amountPaise: 100, description: '', category: 'bills', accountId: 'a', toAccountId: null, date: '2026-12-05' };
  assert.equal(validate({ ...base, kind: 'expense' }, '2026-11-16', true).date, undefined);
  assert.equal(validate({ ...base, kind: 'expense' }, '2026-11-16', false).date, "This can't be in the future.");
  assert.equal(
    validate({ ...base, kind: 'transfer', category: null, toAccountId: 'b' }, '2026-11-16', true).date,
    "This can't be in the future.",
  );
  assert.equal(scheduleKindFor('expense', 'subscriptions'), 'subscription');
  assert.equal(scheduleKindFor('expense', 'bills'), 'bill');
  assert.equal(scheduleKindFor('expense', 'food_delivery'), 'other');
  assert.equal(scheduleKindFor('income', 'salary'), 'income');
  assert.equal(scheduledLabel('2026-12-05'), 'Scheduled for 5 Dec');
});

test('history: the Recurring filter keeps entries that belong to a scheduled item', () => {
  const t = (id: string, schedule_id: string | null) =>
    ({ id, type: 'expense', amount_paise: 100, account_id: 'a', to_account_id: null, category: 'bills',
       description: id, note: null, reason: null, occurred_on: '2026-11-16', created_at: '', deleted: false,
       client_key: id, schedule_id }) as LedgerTxn; // prettier-ignore
  const rows = applyFilters([t('rent', 's1'), t('chai', null)], { type: 'recurring', accountId: null, category: null, query: '' });
  assert.deepEqual(rows.map((r) => r.id), ['rent']);
});
