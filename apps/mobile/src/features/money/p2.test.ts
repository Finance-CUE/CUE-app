import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  byDate,
  contributionPrompt,
  fundingAccounts,
  headerLine,
  jarsMetaLine,
  jarTag,
  methodLine,
  moveLine,
  savedOfTarget,
  shortLine,
  stepProblem,
  suggestionLine,
  type JarForm,
} from './jars/model.ts';
import type { Account, Jar, JarMove } from './types.ts';

const fmt = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

const JAR: Jar = {
  id: 'j1', name: 'Goa Trip', icon: '🏖️', target_paise: 30_000_00, target_date: '2027-03-15', account_id: 'a1',
  method: 'manual', contribution_paise: null, next_contribution_on: null, status: 'active', state: 'active',
  saved_paise: 12_000_00, remaining_paise: 18_000_00, progress: 40, suggested_monthly_paise: 4_500_00,
  behind: false, contribution_due: false, account_short_paise: 0, celebrated: false, created_at: '',
}; // prettier-ignore

test('card labels read as the spec example', () => {
  assert.equal(headerLine(57_000_00, 3, fmt), '₹57,000 set aside across 3 jars');
  assert.equal(headerLine(5_00, 1, fmt), '₹5 set aside across 1 jar');
  assert.equal(headerLine(0, 0, fmt), null);
  assert.equal(savedOfTarget(JAR, fmt), '₹12,000 / ₹30,000');
  assert.equal(byDate(JAR), 'by 15 Mar');
  assert.equal(byDate({ target_date: null }), null);
  assert.equal(suggestionLine(JAR, fmt), '₹4,500 a month gets you there by 15 Mar.');
});

test('one tag per card, most important first', () => {
  assert.equal(jarTag(JAR), null);
  assert.deepEqual(jarTag({ ...JAR, behind: true }), { label: 'A little behind', tone: 'attention' });
  assert.deepEqual(jarTag({ ...JAR, behind: true, state: 'paused' }), { label: 'Paused', tone: 'muted' });
  assert.deepEqual(jarTag({ ...JAR, state: 'complete' }), { label: 'Reached 🎉', tone: 'positive' });
  assert.deepEqual(jarTag({ ...JAR, state: 'date_passed' }), { label: 'Target date passed', tone: 'attention' });
  const due = { ...JAR, contribution_due: true, contribution_paise: 2_000_00 };
  assert.deepEqual(jarTag(due), { label: 'Add money?', tone: 'attention' });
  assert.equal(contributionPrompt(due, fmt), 'Add ₹2,000 to Goa Trip?');
  assert.equal(contributionPrompt(JAR, fmt), null);
});

test('account lines, history rows and method line', () => {
  const hdfc = { id: 'a1', name: 'HDFC', kind: 'savings', archived: false, in_jars_paise: 10_000_00, free_paise: 55_000_00 } as Account;
  assert.equal(jarsMetaLine(hdfc, fmt), '₹10,000 in jars · ₹55,000 free');
  assert.equal(jarsMetaLine({ ...hdfc, in_jars_paise: 0 }, fmt), null);
  assert.equal(shortLine({ ...JAR, account_short_paise: 100 }, new Map([['a1', hdfc]])), 'Your jars hold more than HDFC has right now.');
  assert.equal(shortLine(JAR, new Map()), null);
  const m = { amount_paise: -4_000_00, note: null, auto: false } as JarMove;
  assert.deepEqual(moveLine(m, fmt), { amount: '−₹4,000', label: 'Withdrawn' });
  assert.deepEqual(moveLine({ ...m, amount_paise: 2_000_00, auto: true }, fmt), { amount: '+₹2,000', label: 'Automatic contribution' });
  assert.equal(methodLine(JAR, fmt), 'You add money when you choose');
  assert.equal(
    methodLine({ ...JAR, method: 'monthly', contribution_paise: 2_000_00, next_contribution_on: '2026-12-16' }, fmt),
    'Monthly · ₹2,000 · next 16 Dec · asks before adding',
  );
  const card = { ...hdfc, id: 'c', kind: 'credit_card' } as Account;
  assert.deepEqual(fundingAccounts([hdfc, card]).map((a) => a.id), ['a1']);
});

test('create jar steps stop on the right problem', () => {
  const form: JarForm = {
    name: 'Goa', targetPaise: 30_000_00, targetDate: '', icon: '🏖️', initialPaise: 0, method: 'manual',
    contributionPaise: null, accountId: 'a1',
  }; // prettier-ignore
  const free = () => 5_000_00;
  const today = '2026-11-16';
  assert.equal(stepProblem('Name', { ...form, name: ' ' }, today, free), 'Give your goal a name.');
  assert.equal(stepProblem('Target date', form, today, free), null); // skipped
  assert.equal(stepProblem('Target date', { ...form, targetDate: '2026-11-16' }, today, free), 'Choose a date after today.');
  assert.equal(stepProblem('How you add', { ...form, method: 'weekly' }, today, free), 'Enter how much to add each time.');
  assert.equal(
    stepProblem('Account', { ...form, initialPaise: 6_000_00 }, today, free),
    'That first contribution is more than this account has free.',
  );
  assert.equal(stepProblem('Account', { ...form, initialPaise: 5_000_00 }, today, free), null);
});
