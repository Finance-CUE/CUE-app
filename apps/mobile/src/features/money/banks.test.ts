import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BANKS, bankBySlug, searchBanks, suggestNickname } from './banks.ts';

test('bank slugs are unique and valid for the server', () => {
  const slugs = BANKS.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9_-]{1,40}$/);
});

test('search ranks exact and prefix matches first, always offering Other', () => {
  assert.deepEqual(searchBanks('hdfc').map((b) => b.slug), ['hdfc', 'other']);
  assert.equal(searchBanks('sb')[0].slug, 'sbi');
  assert.equal(searchBanks('baroda')[0].slug, 'bob');
  assert.equal(searchBanks('811')[0].slug, 'kotak');
  assert.deepEqual(searchBanks('zzz').map((b) => b.slug), ['other']);
  const empty = searchBanks('');
  assert.equal(empty.length, 6);
  assert.equal(empty[empty.length - 1].slug, 'other');
});

test('a picked bank suggests a nickname', () => {
  assert.equal(suggestNickname(bankBySlug('hdfc'), 'savings'), 'HDFC Savings');
  assert.equal(suggestNickname(bankBySlug('icici'), 'credit_card'), 'ICICI Card');
  assert.equal(suggestNickname(bankBySlug('other'), 'savings'), '');
  assert.equal(suggestNickname(undefined, 'cash'), 'Cash');
});
