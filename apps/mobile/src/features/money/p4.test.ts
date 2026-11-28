import assert from 'node:assert/strict';
import { test } from 'node:test';

import { askAbout, draftTxn, fillAmounts, insightsRoute, noteCopy, understandLines } from './insights/model.ts';
import { learnedCategory, merchantOf } from './insights/merchant.ts';
import type { Note } from './types.ts';

const fmt = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;
const hidden = () => '₹ •••••';

test('amount tokens follow the formatter, so hidden amounts stay hidden', () => {
  assert.equal(fillAmounts('You spent {{₹120000}} on food.', fmt), 'You spent ₹1,200 on food.');
  assert.equal(fillAmounts('You spent {{₹120000}} on food.', hidden), 'You spent ₹ ••••• on food.');
  assert.equal(fillAmounts('Down {{₹-5000}}', fmt), 'Down −₹50');
});

const note = (kind: Note['kind'], params: Record<string, unknown>, details: Record<string, unknown> = {}): Note => ({
  key: 'k', kind, params, details,
}); // prettier-ignore

test('note sentences observe and never judge', () => {
  const up = note('category_up', { category: 'food_delivery', percent: 18, now_paise: 5_900_00, then_paise: 5_000_00 },
    { then_start: '2026-10-01', then_end: '2026-10-16', transactions: [{ description: 'Swiggy', amount_paise: 1_200_00, occurred_on: '2026-11-12' }] }); // prettier-ignore
  assert.deepEqual(noteCopy(up, fmt), {
    title: 'Your food & delivery spending is up 18% on the same days last month.',
    line: '₹5,900 so far this month against ₹5,000 by this point last month.',
  });
  const why = understandLines(up, fmt);
  assert.equal(why.numbers[1], '₹5,000 on the same days last month (1 Oct – 16 Oct)');
  assert.deepEqual(why.entries, ['Swiggy · 12 Nov · ₹1,200']);
  assert.ok(!/overspen|too much|bad/i.test(noteCopy(up, fmt).title));

  assert.equal(noteCopy(note('pending', { person: 'Aditi', amount_paise: 2_000_00, days: 16 }), fmt).title, '₹2,000 pending from Aditi.');
  assert.equal(
    noteCopy(note('due_soon', { count: 2, total_paise: 4_000_00, name: 'Netflix', amount_paise: 199_00, due_on: '2026-11-18' }), fmt).title,
    '₹4,000 in payments due in the next 3 days.',
  );
  assert.equal(noteCopy(note('jar_milestone', { name: 'Goa Trip', milestone: 50, saved_paise: 15_000_00, target_paise: 30_000_00 }), fmt).title, 'Goa Trip jar is 50% complete.');
  assert.equal(noteCopy(note('streak', { weeks: 3, average_paise: 3_000_00 }), fmt).title, "You've spent less than usual for 3 weeks in a row.");
  assert.equal(noteCopy(note('pending', { person: 'Aditi', amount_paise: 2_000_00, days: 16 }), hidden).title, '₹ ••••• pending from Aditi.');
});

test('view insights and ask CUE follow the note', () => {
  assert.equal(insightsRoute(note('category_up', {})), '/expenses');
  assert.equal(insightsRoute(note('jar_milestone', { jar_id: 'j1' })), '/jar/j1');
  assert.equal(askAbout(note('pending', { person: 'Ravi' })), 'How much does Ravi owe me?');
});

test('merchants read like the server, and remembered categories apply', () => {
  assert.deepEqual(merchantOf('Paid to Zepto'), { key: 'zepto', label: 'Zepto' });
  assert.equal(merchantOf('123'), null);
  const rules = [{ merchant: 'zepto', kind: 'expense' as const, category: 'groceries' }];
  assert.equal(learnedCategory(rules, 'zepto order', 'expense'), 'groceries');
  assert.equal(learnedCategory(rules, 'zepto order', 'income'), null);
  assert.equal(learnedCategory(rules, 'Swiggy', 'expense'), null);
});

test('a draft opens as an unsaved entry with its own date', () => {
  const t = draftTxn({ type: 'expense', amount_paise: 500_00, category: 'food_delivery', description: 'Dinner', account_id: 'hdfc', occurred_on: '2026-11-15' });
  assert.deepEqual([t.type, t.amount_paise, t.category, t.account_id, t.occurred_on, t.id], ['expense', 500_00, 'food_delivery', 'hdfc', '2026-11-15', 'draft']);
});
