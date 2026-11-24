import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatRupees } from '../format.ts';
import type { Account, NetWorth } from '../types.ts';
import {
  accountAmount,
  accountGroups,
  balanceDifference,
  breakdown,
  changeLine,
  helloLine,
  initials,
  netWorthSentence,
  shortDay,
  shortTime,
} from './model.ts';

const account = (id: string, kind: Account['kind'], balance: number | null): Account => ({
  id,
  name: id,
  kind,
  bank: null,
  icon: null,
  archived: false,
  balance_paise: balance,
  created_at: '2026-11-01T00:00:00Z',
});

// The spec's example set (4.x): HDFC 65,000, SBI 30,000, ICICI 5,000, cash 5,000,
// lent 2,000, card 10,000, loan 13,000, borrowed 896.
const ACCOUNTS = [
  account('HDFC', 'savings', 65_000_00),
  account('SBI', 'savings', 30_000_00),
  account('ICICI', 'savings', 5_000_00),
  account('Cash', 'cash', 5_000_00),
  account('Card', 'credit_card', -10_000_00),
];
const NW: NetWorth = {
  on: '2026-11-16',
  available_paise: 1_05_000_00,
  other_assets_paise: 0,
  receivables_paise: 2_000_00,
  card_dues_paise: 10_000_00,
  borrowings_paise: 896_00,
  other_liabilities_paise: 13_000_00,
  total_assets_paise: 1_07_000_00,
  total_liabilities_paise: 23_896_00,
  net_worth_paise: 83_104_00,
  change_this_month_paise: 5_200_00,
  accounts: ACCOUNTS,
};

test('header lines', () => {
  assert.equal(shortDay('2026-11-11'), 'Wed 11 Nov');
  assert.equal(helloLine(' Asha  Rao '), 'Hello, Asha.');
  assert.equal(helloLine(''), 'Hello.');
  assert.equal(initials('Asha Devi Rao'), 'AR');
  assert.equal(initials('asha'), 'A');
  assert.equal(initials(''), 'C');
  assert.equal(shortTime(new Date(2026, 10, 16, 10, 42).getTime()), '10:42 am');
  assert.equal(shortTime(new Date(2026, 10, 16, 0, 5).getTime()), '12:05 am');
  assert.equal(shortTime(new Date(2026, 10, 16, 15, 0).getTime()), '3:00 pm');
});

test('change line uses arrows and words, and hides without a full month', () => {
  assert.deepEqual(changeLine(5_200_00, formatRupees), {
    text: '↑ ₹5,200 this month',
    spoken: 'up ₹5,200 this month',
  });
  assert.equal(changeLine(-800_00, formatRupees)?.text, '↓ ₹800 this month');
  assert.equal(changeLine(null, formatRupees), null);
  assert.equal(
    netWorthSentence(NW, formatRupees),
    'Net worth, ₹83,104, up ₹5,200 this month',
  );
});

test('breakdown matches the spec worked example', () => {
  const b = breakdown(NW, ACCOUNTS);
  assert.deepEqual(
    b.assets.map((r) => [r.label, r.paise]),
    [
      ['Bank accounts', 1_00_000_00],
      ['Cash', 5_000_00],
      ['Money lent', 2_000_00],
      ['Other assets', 0],
    ],
  );
  assert.equal(b.assets.reduce((s, r) => s + r.paise, 0), b.totalAssets);
  assert.equal(b.liabilities.reduce((s, r) => s + r.paise, 0), b.totalLiabilities);
  assert.equal(b.totalAssets - b.totalLiabilities, NW.net_worth_paise);
});

test('cards and loans are grouped and read as due', () => {
  const g = accountGroups(ACCOUNTS);
  assert.deepEqual(g.cardsAndLoans.map((a) => a.id), ['Card']);
  assert.equal(g.money.length, 4);
  assert.equal(accountAmount(ACCOUNTS[4], formatRupees), '₹10,000 due');
  assert.equal(accountAmount(ACCOUNTS[0], formatRupees), '₹65,000');
  assert.equal(accountAmount(account('New', 'savings', null), formatRupees), '—');
});

test('update balance shows the difference the adjustment will save', () => {
  const hdfc = ACCOUNTS[0];
  assert.deepEqual(balanceDifference(hdfc, 64_200_00, formatRupees), {
    diff: -800_00,
    text: 'CUE shows ₹65,000, you entered ₹64,200, difference −₹800',
  });
  assert.equal(balanceDifference(hdfc, 65_000_00, formatRupees).diff, 0);
  // A card compares amounts due.
  const card = balanceDifference(ACCOUNTS[4], 12_000_00, formatRupees);
  assert.equal(card.diff, 2_000_00);
  assert.equal(card.text, 'CUE shows ₹10,000, you entered ₹12,000, difference +₹2,000');
});
