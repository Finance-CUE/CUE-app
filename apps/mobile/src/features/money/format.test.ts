import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatRupees, paiseToInput, parseRupeesToPaise } from './format.ts';

test('parseRupeesToPaise accepts up to 2 decimals', () => {
  assert.equal(parseRupeesToPaise('54.34'), 5434);
  assert.equal(parseRupeesToPaise('1,00,000'), 10_000_000);
  assert.equal(parseRupeesToPaise('0'), 0);
});

test('parseRupeesToPaise rejects extra decimals and extra dots', () => {
  for (const bad of ['0.543', '54.345', '54.34.5', '1.2.3', '', '-5']) {
    assert.equal(parseRupeesToPaise(bad), null, bad);
  }
});

test('formatRupees always shows 2 decimals with Indian grouping', () => {
  assert.equal(formatRupees(10_000_000), '₹1,00,000.00');
  assert.equal(formatRupees(12050), '₹120.50');
  assert.equal(formatRupees(0), '₹0.00');
  assert.equal(formatRupees(-50000), '−₹500.00');
});

test('paiseToInput round-trips with parseRupeesToPaise', () => {
  for (const p of [15000, 12050, 5, 100, 0]) {
    assert.equal(parseRupeesToPaise(paiseToInput(p)), p);
  }
  assert.equal(paiseToInput(15000), '150');
});
