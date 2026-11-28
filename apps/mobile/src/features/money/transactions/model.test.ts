import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatRupees } from '../format.ts';
import type { Account, LedgerTxn } from '../types.ts';
import {
  applyFilters,
  canDuplicate,
  dayGroups,
  dayMonth,
  deleteQuestion,
  isDeletable,
  isEditable,
  latestForDay,
  rowFor,
} from './model.ts';

const acct = (id: string, name: string): Account => ({
  id,
  name,
  kind: 'savings',
  bank: null,
  icon: null,
  archived: false,
  balance_paise: 0,
  created_at: '2026-11-01T00:00:00Z',
});
const ACCOUNTS = new Map([
  ['hdfc', acct('hdfc', 'HDFC')],
  ['cash', acct('cash', 'Cash')],
]);

let n = 0;
const txn = (over: Partial<LedgerTxn>): LedgerTxn => ({
  id: `t${++n}`,
  client_key: `k${n}`,
  type: 'expense',
  amount_paise: 450_00,
  account_id: 'hdfc',
  to_account_id: null,
  category: 'food_delivery',
  description: 'Swiggy',
  note: null,
  reason: null,
  occurred_on: '2026-11-12',
  created_at: new Date(2026, 10, 12, 20, 42).toISOString(),
  deleted: false,
  ...over,
});

test('rows follow the spec table', () => {
  const expense = rowFor(txn({}), ACCOUNTS, formatRupees);
  assert.deepEqual(
    [expense.title, expense.subtitle, expense.amount, expense.tone],
    ['Swiggy', 'Food & delivery · HDFC · 8:42 pm', '− ₹450', 'ink'],
  );
  const income = rowFor(txn({ type: 'income', category: 'salary', description: 'Salary', amount_paise: 35_000_00 }), ACCOUNTS, formatRupees);
  assert.deepEqual([income.title, income.subtitle, income.amount, income.tone], ['Salary', 'Salary · HDFC', '+ ₹35,000', 'positive']);
  const transfer = rowFor(txn({ type: 'transfer', to_account_id: 'cash', category: null, description: null, amount_paise: 5_000_00 }), ACCOUNTS, formatRupees);
  assert.deepEqual([transfer.title, transfer.amount, transfer.tone], ['HDFC → Cash', '⇄ ₹5,000', 'soft']);
  const lent = rowFor(txn({ type: 'lend', account_id: 'cash', description: 'Aditi', category: null, amount_paise: 2_000_00 }), ACCOUNTS, formatRupees);
  assert.deepEqual([lent.title, lent.amount], ['Lent to Aditi', '↗ ₹2,000']);
  const adj = rowFor(txn({ type: 'adjustment', amount_paise: -800_00, reason: 'Bank charge', description: null, category: null }), ACCOUNTS, formatRupees);
  assert.deepEqual([adj.title, adj.subtitle, adj.amount], ['Balance adjustment', 'HDFC · Bank charge', '− ₹800']);
  assert.match(expense.spoken, /^Swiggy, minus ₹450, /);
});

test("today's card shows that day's latest five, without openings", () => {
  const day = '2026-11-12';
  const many = Array.from({ length: 7 }, (_, i) =>
    txn({ created_at: new Date(2026, 10, 12, 9 + i).toISOString(), description: `e${i}` }),
  );
  const rows = latestForDay([...many, txn({ type: 'opening' }), txn({ occurred_on: '2026-11-11' })], day);
  assert.deepEqual(rows.map((r) => r.description), ['e6', 'e5', 'e4', 'e3', 'e2']);
});

test('history groups by day with spent and received totals', () => {
  const groups = dayGroups([
    txn({ occurred_on: '2026-11-11', amount_paise: 100_00 }),
    txn({ occurred_on: '2026-11-12', amount_paise: 450_00 }),
    txn({ occurred_on: '2026-11-12', type: 'refund', amount_paise: 50_00 }),
    txn({ occurred_on: '2026-11-12', type: 'income', amount_paise: 1_000_00 }),
    txn({ occurred_on: '2026-11-12', type: 'transfer', to_account_id: 'cash', amount_paise: 9_999_00 }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.day, g.spentPaise, g.receivedPaise, g.items.length]),
    [
      ['2026-11-12', 400_00, 1_000_00, 4],
      ['2026-11-11', 100_00, 0, 1],
    ],
  );
});

test('filters and search by description, amount, notes and category', () => {
  const all = [
    txn({ description: 'Swiggy dinner', amount_paise: 450_00 }),
    txn({ description: 'Uber', category: 'transport', amount_paise: 230_50, account_id: 'cash' }),
    txn({ type: 'income', description: 'Salary', category: 'salary', amount_paise: 35_000_00, note: 'November' }),
    txn({ type: 'transfer', description: null, category: null, to_account_id: 'cash', amount_paise: 1_000_00 }),
    txn({ description: 'Old', deleted: true }),
  ];
  const base = { type: 'all' as const, accountId: null, category: null, query: '' };
  const find = (over: Partial<typeof base>) => applyFilters(all, { ...base, ...over }).map((t) => t.description);
  assert.equal(find({}).length, 4);
  assert.deepEqual(find({ query: 'swig' }), ['Swiggy dinner']);
  assert.deepEqual(find({ query: '₹230' }), ['Uber']);
  assert.deepEqual(find({ query: '35,000' }), ['Salary']);
  assert.deepEqual(find({ query: 'novem' }), ['Salary']);
  assert.deepEqual(find({ query: 'transport' }), ['Uber']);
  assert.deepEqual(find({ type: 'income' }), ['Salary']);
  assert.deepEqual(find({ accountId: 'cash' }), ['Uber', null]); // the transfer went to Cash
  assert.deepEqual(find({ category: 'transport' }), ['Uber']);
});

test('delete asks first, naming the balances that change', () => {
  assert.equal(
    deleteQuestion(txn({}), ACCOUNTS, formatRupees),
    'Delete Swiggy, ₹450 on 12 Nov? Your HDFC balance and net worth will update.',
  );
  assert.equal(
    deleteQuestion(txn({ type: 'transfer', description: null, category: null, to_account_id: 'cash' }), ACCOUNTS, formatRupees),
    'Delete this transfer, ₹450 on 12 Nov? Your HDFC and Cash balances and net worth will update.',
  );
  assert.equal(dayMonth('2026-01-05'), '5 Jan');
});

test('what each row can do', () => {
  assert.equal(isEditable(txn({})), true);
  assert.equal(isEditable(txn({ type: 'lend' })), false);
  assert.equal(isDeletable(txn({ type: 'adjustment' })), true);
  assert.equal(isDeletable(txn({ type: 'opening' })), false);
  assert.equal(canDuplicate(txn({ type: 'refund' })), false);
  assert.equal(isEditable(txn({ type: 'refund' })), false);
  assert.equal(isDeletable(txn({ type: 'refund' })), true);
});
