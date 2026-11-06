import assert from 'node:assert/strict';
import { test } from 'node:test';

import { personBalances } from './khata.ts';

const e = (id: string, direction: 'lent' | 'borrowed', person: string, amount_paise: number) => ({
  id,
  direction,
  person,
  amount_paise,
  note: null,
  created_at: '2026-11-06T00:00:00Z',
});

test('net is lent minus borrowed, sorted by abs net then name', () => {
  const r = personBalances([e('1', 'lent', 'Asha', 500), e('2', 'borrowed', 'Ravi', 900), e('3', 'borrowed', 'Asha', 100)]);
  assert.deepEqual(r.map((p) => [p.person, p.net_paise]), [['Ravi', -900], ['Asha', 400]]);
  assert.equal(r[1].entries.length, 2);
});

test('same name in different case merges under a lowercase key', () => {
  const r = personBalances([e('1', 'lent', 'Asha', 500), e('2', 'lent', ' asha ', 200)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].key, 'asha');
  assert.equal(r[0].net_paise, 700);
});

test('zero net is kept', () => {
  const r = personBalances([e('1', 'lent', 'Asha', 500), e('2', 'borrowed', 'Asha', 500)]);
  assert.equal(r[0].net_paise, 0);
});
