import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatRupees } from '../format.ts';
import type { Account, LedgerTxn } from '../types.ts';
import {
  defaultAccountId,
  defaultToAccountId,
  EXPENSE_CATEGORIES,
  hasInput,
  INCOME_CATEGORIES,
  lowBalanceNote,
  savedLabel,
  smartDefaults,
  suggestExpenseCategory,
  suggestIncomeCategory,
  validate,
  type EntryForm,
} from './model.ts';

const account = (id: string, kind: Account['kind'], balance: number | null = 0, archived = false): Account => ({
  id,
  name: id,
  kind,
  bank: null,
  icon: null,
  archived,
  balance_paise: balance,
  created_at: '2026-11-01T00:00:00Z',
});

let n = 0;
const txn = (type: LedgerTxn['type'], description: string, accountId: string, on: string, category: string | null = null): LedgerTxn => ({
  id: `t${++n}`,
  client_key: `k${n}`,
  type,
  amount_paise: 100,
  account_id: accountId,
  to_account_id: null,
  category,
  description,
  note: null,
  reason: null,
  occurred_on: on,
  created_at: `${on}T10:00:00Z`,
  deleted: false,
});

test('the spec lists 12 expense and 8 income categories', () => {
  assert.equal(EXPENSE_CATEGORIES.length, 12);
  assert.equal(INCOME_CATEGORIES.length, 8);
});

test('categories are suggested as the user types', () => {
  assert.equal(suggestExpenseCategory('Swiggy dinner'), 'food_delivery');
  assert.equal(suggestExpenseCategory('Zepto order'), 'groceries');
  assert.equal(suggestExpenseCategory('Apollo pharmacy'), 'health');
  assert.equal(suggestExpenseCategory('Haircut'), 'personal_care');
  assert.equal(suggestExpenseCategory('Goa flight'), 'travel');
  assert.equal(suggestExpenseCategory('PVR movie'), 'entertainment');
  assert.equal(suggestExpenseCategory('Netflix'), 'subscriptions');
  assert.equal(suggestExpenseCategory('xyz'), null);
  assert.equal(suggestIncomeCategory('November salary'), 'salary');
  assert.equal(suggestIncomeCategory('Amazon refund'), 'refunds');
  assert.equal(suggestIncomeCategory('Client invoice'), 'freelance');
});

test('smart defaults copy the latest entry with the same description', () => {
  const history = [
    txn('expense', 'Uber', 'hdfc', '2026-11-01', 'transport'),
    txn('expense', 'uber ', 'icici', '2026-11-10', 'travel'),
    txn('income', 'Uber', 'sbi', '2026-11-12', 'other'),
  ];
  assert.deepEqual(smartDefaults(history, 'expense', ' UBER'), { category: 'travel', accountId: 'icici' });
  assert.equal(smartDefaults(history, 'expense', 'Ola'), null);
  assert.equal(smartDefaults(history, 'expense', '  '), null);
});

test('the account chip defaults to the last account used for that type', () => {
  const accounts = [account('hdfc', 'savings'), account('cash', 'cash'), account('old', 'savings', 0, true)];
  const history = [txn('expense', 'Chai', 'cash', '2026-11-14'), txn('expense', 'Lunch', 'old', '2026-11-15')];
  // The archived account is skipped; the latest open one wins.
  assert.equal(defaultAccountId(accounts, history, 'expense'), 'cash');
  // No income yet: a bank account.
  assert.equal(defaultAccountId([account('cash', 'cash'), account('hdfc', 'savings')], [], 'income'), 'hdfc');
  assert.equal(defaultAccountId([], [], 'expense'), null);
  assert.equal(defaultToAccountId(accounts, 'hdfc'), 'cash');
});

const form = (over: Partial<EntryForm> = {}): EntryForm => ({
  kind: 'expense',
  amountPaise: 500_00,
  description: 'Lunch',
  category: 'food_delivery',
  accountId: 'hdfc',
  toAccountId: null,
  date: '2026-11-16',
  ...over,
});

test('validation explains each field', () => {
  assert.deepEqual(validate(form(), '2026-11-16'), {});
  assert.equal(validate(form({ amountPaise: 0 }), '2026-11-16').amount, 'Enter an amount above ₹0.');
  assert.equal(validate(form({ category: null }), '2026-11-16').category, 'Choose a category.');
  assert.equal(validate(form({ date: '2026-11-17' }), '2026-11-16').date, "This can't be in the future.");
  assert.equal(validate(form({ date: null }), '2026-11-16').date, 'Enter the date as DD/MM/YYYY.');
  const t = form({ kind: 'transfer', category: null, toAccountId: 'hdfc' });
  assert.deepEqual(validate(t, '2026-11-16'), { toAccount: 'Choose two different accounts.' });
  assert.equal(validate({ ...t, toAccountId: null }, '2026-11-16').toAccount, 'Choose the account the money went to.');
});

test('discard is asked only when something was typed', () => {
  assert.equal(hasInput('', ' ', ''), false);
  assert.equal(hasInput('50', '', ''), true);
  assert.equal(hasInput('', '', 'note'), true);
});

test('low balance is a quiet note, never for a credit card', () => {
  assert.equal(lowBalanceNote(account('Cash', 'cash', 300_00), 500_00, formatRupees), 'This takes Cash to −₹200. Update the balance?');
  assert.equal(lowBalanceNote(account('Cash', 'cash', 500_00), 500_00, formatRupees), null);
  assert.equal(lowBalanceNote(account('Card', 'credit_card', -100), 500_00, formatRupees), null);
  assert.equal(lowBalanceNote(undefined, 500_00, formatRupees), null);
  assert.equal(savedLabel('expense'), 'Expense saved');
});
