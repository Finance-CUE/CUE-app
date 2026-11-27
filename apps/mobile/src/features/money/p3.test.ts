import assert from 'node:assert/strict';
import { test } from 'node:test';

import { equalShares, exactLeft, expenseMeta, memberLine, myBalanceLine, stepLine, validateExpense } from './groups/model.ts';
import { personBalances } from './khata.ts';
import { breakdown } from './today/model.ts';
import { applyFilters, collapseGroupRows, dayGroups, isEditable, rowFor } from './transactions/model.ts';
import type { Account, GroupMember, KhataEntry, LedgerTxn, NetWorth } from './types.ts';

const fmt = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

const members: GroupMember[] = [
  { id: 'me', name: 'You', is_me: true, removed: false, balance_paise: 2_000_00 },
  { id: 'm', name: 'Megha', is_me: false, removed: false, balance_paise: -1_000_00 },
  { id: 'a', name: 'Aditi', is_me: false, removed: false, balance_paise: -1_000_00 },
];

test('group balance lines and who pays whom', () => {
  assert.equal(myBalanceLine(2_000_00, fmt), "You're owed ₹2,000");
  assert.equal(myBalanceLine(-500_00, fmt), 'You owe ₹500');
  assert.equal(myBalanceLine(0, fmt), "You're all square");
  assert.equal(memberLine(members[1], fmt), 'Megha owes ₹1,000');
  assert.equal(memberLine({ ...members[1], balance_paise: 300_00 }, fmt), 'Megha gets back ₹300');
  assert.equal(stepLine({ members }, { from_member: 'm', to_member: 'me', amount_paise: 1_000_00 }, fmt), 'Megha pays you ₹1,000');
  assert.equal(stepLine({ members }, { from_member: 'me', to_member: 'a', amount_paise: 500_00 }, fmt), 'You pay Aditi ₹500');
  assert.equal(expenseMeta({ members }, 'm', 'equal', 3), 'Megha paid · split equally between 3');
});

test('splits match the server and validation sits under fields', () => {
  assert.deepEqual(equalShares(1000, ['a', 'b', 'c']), { a: 334, b: 333, c: 333 });
  assert.equal(exactLeft(300, { a: 100, b: 150 }), 50);
  const base = {
    description: 'Dinner', amountPaise: 3_000_00, paidBy: 'me', split: 'equal' as const, participants: ['me', 'm'],
    shares: {}, meId: 'me', accountId: 'acct', date: '2026-11-16',
  }; // prettier-ignore
  assert.deepEqual(validateExpense(base, '2026-11-16', fmt), {});
  assert.equal(validateExpense({ ...base, accountId: null }, '2026-11-16', fmt).account, 'Choose the account you paid from.');
  assert.equal(validateExpense({ ...base, paidBy: 'm', accountId: null }, '2026-11-16', fmt).account, undefined);
  assert.equal(validateExpense({ ...base, split: 'exact', shares: { me: 1_000_00 } }, '2026-11-16', fmt).split, '₹2,000 still to split.');
  assert.equal(validateExpense({ ...base, participants: [] }, '2026-11-16', fmt).split, 'Choose the people sharing it.');
});

const txn = (over: Partial<LedgerTxn>): LedgerTxn => ({
  id: 'x', client_key: 'k', type: 'expense', amount_paise: 100, account_id: 'acct', to_account_id: null,
  category: 'food_delivery', description: 'Dinner', note: null, reason: null, occurred_on: '2026-11-16',
  created_at: '2026-11-16T10:00:00Z', deleted: false, ...over,
}); // prettier-ignore

test('a group expense shows as one row with your share and what you paid', () => {
  const rows = [
    txn({ id: 'e1', amount_paise: 1_000_00, group_id: 'g', group_expense_id: 'ge' }),
    txn({ id: 'e2', type: 'lend', amount_paise: 2_000_00, category: null, group_id: 'g', group_expense_id: 'ge' }),
    txn({ id: 'c', description: 'Chai', amount_paise: 20_00 }),
  ];
  const one = collapseGroupRows(rows);
  assert.equal(one.length, 2);
  assert.deepEqual([one[0].group_share_paise, one[0].group_paid_paise, one[0].amount_paise], [1_000_00, 3_000_00, 1_000_00]);
  const accounts = new Map<string, Account>([['acct', { id: 'acct', name: 'HDFC' } as Account]]);
  const r = rowFor(one[0], accounts, fmt, new Map([['g', 'Goa Trip']]));
  assert.equal(r.title, 'Dinner');
  assert.equal(r.subtitle, 'Goa Trip · Your share ₹1,000 · HDFC');
  assert.equal(r.amount, '− ₹3,000 paid');
  // Day totals count your share once, never the money fronted for others.
  assert.equal(dayGroups(rows)[0].spentPaise, 1_000_00 + 20_00);
  assert.equal(isEditable(one[0]), false);
  // Someone else paid: share only, no account.
  const other = collapseGroupRows([
    txn({ id: 'o1', account_id: null, amount_paise: 500_00, group_id: 'g', group_expense_id: 'g2' }),
    txn({ id: 'o2', type: 'borrow', account_id: null, amount_paise: 500_00, category: null, group_id: 'g', group_expense_id: 'g2' }),
  ]);
  assert.equal(rowFor(other[0], accounts, fmt, new Map()).amount, '− ₹500');
  assert.equal(rowFor(other[0], accounts, fmt, new Map()).subtitle, 'Group · Your share ₹500 · someone else paid');
  // A settlement.
  const s = rowFor(txn({ type: 'repayment_received', description: 'Megha paid you', amount_paise: 1_000_00, group_id: 'g', group_settlement_id: 's' }), accounts, fmt, new Map([['g', 'Goa Trip']]));
  assert.deepEqual([s.title, s.subtitle, s.amount, s.tone], ['Megha paid you', 'Goa Trip · HDFC', '+ ₹1,000 settled', 'positive']);
});

test('filters: Group expenses and Khata stay apart', () => {
  const rows = [txn({ id: 'g', group_id: 'g', group_expense_id: 'e' }), txn({ id: 'k', type: 'lend', khata_entry_id: 'k1' } as Partial<LedgerTxn>)];
  const base = { accountId: null, category: null, query: '' };
  assert.deepEqual(applyFilters(rows, { ...base, type: 'group' }).map((t) => t.id), ['g']);
  assert.deepEqual(applyFilters(rows, { ...base, type: 'khata' }).map((t) => t.id), ['k']);
});

test('breakdown shows group rows apart, only once there are groups', () => {
  const nw = {
    available_paise: 0, other_assets_paise: 0, receivables_paise: 3_000_00, card_dues_paise: 0, borrowings_paise: 500_00,
    other_liabilities_paise: 0, total_assets_paise: 3_000_00, total_liabilities_paise: 500_00, net_worth_paise: 2_500_00,
    money_lent_paise: 1_000_00, money_borrowed_paise: 0, group_owed_paise: 2_000_00, group_owe_paise: 500_00,
  } as NetWorth; // prettier-ignore
  const b = breakdown(nw, []);
  assert.deepEqual(b.assets.map((r) => [r.label, r.paise]).slice(2, 4), [['Money lent', 1_000_00], ['Owed to you in groups', 2_000_00]]);
  assert.deepEqual(b.liabilities.at(-1), { label: 'You owe in groups', paise: 500_00 });
  const none = breakdown({ ...nw, group_owed_paise: 0, group_owe_paise: 0 }, []);
  assert.ok(!none.assets.some((r) => r.label.includes('groups')));
  assert.ok(breakdown({ ...nw, group_owed_paise: 0, group_owe_paise: 0 }, [], true).assets.some((r) => r.label.includes('groups')));
});

test('Khata balances use what is still open after part payments', () => {
  const e = (over: Partial<KhataEntry>): KhataEntry =>
    ({ id: 'k', direction: 'lent', person: 'Ravi', amount_paise: 2_000_00, note: null, created_at: '', ...over }) as KhataEntry;
  const [ravi] = personBalances([e({ outstanding_paise: 1_500_00 }), e({ id: 'k2', direction: 'borrowed', amount_paise: 200_00 })]);
  assert.equal(ravi.net_paise, 1_300_00);
});
