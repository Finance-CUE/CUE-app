import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultKhataAccount, khataAccounts, newClientKey } from './accounts.ts';
import type { Account } from './types.ts';

const account = (id: string, kind: Account['kind'], archived = false): Account => ({
  id,
  name: id,
  kind,
  bank: null,
  icon: null,
  archived,
  balance_paise: 0,
  created_at: '2026-11-01T00:00:00Z',
});

test('the Khata chip offers open bank and cash accounts, not cards', () => {
  const offered = khataAccounts([
    account('hdfc', 'savings'),
    account('card', 'credit_card'),
    account('old', 'cash', true),
    account('cash', 'cash'),
  ]);
  assert.deepEqual(offered.map((a) => a.id), ['hdfc', 'cash']);
});

test('the Khata chip defaults to Cash, else the first account', () => {
  assert.equal(defaultKhataAccount([account('hdfc', 'savings'), account('cash', 'cash')]), 'cash');
  assert.equal(defaultKhataAccount([account('hdfc', 'savings')]), 'hdfc');
  assert.equal(defaultKhataAccount([account('card', 'credit_card')]), null);
  assert.equal(defaultKhataAccount([]), null);
});

test('client keys are distinct v4 UUIDs', () => {
  const keys = new Set(Array.from({ length: 200 }, newClientKey));
  assert.equal(keys.size, 200);
  for (const k of keys) {
    assert.match(k, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});
