import assert from 'node:assert/strict';
import { test } from 'node:test';

import { suggestCategory } from './categories.ts';

test('suggestCategory maps merchants whole-word, case-insensitive', () => {
  assert.equal(suggestCategory('ZOMATO order'), 'food');
  assert.equal(suggestCategory('coffee at Blue Tokai'), 'food');
  assert.equal(suggestCategory('Uber to work'), 'transport');
  assert.equal(suggestCategory('amazon'), 'shopping');
  assert.equal(suggestCategory('PVR tickets'), 'fun');
  assert.equal(suggestCategory('Blinkit'), 'groceries');
});

test('everyday Indian spends are recognised', () => {
  assert.equal(suggestCategory('Chai'), 'food');
  assert.equal(suggestCategory('Lunch with team'), 'food');
  assert.equal(suggestCategory('Auto to station'), 'transport');
  assert.equal(suggestCategory('Petrol'), 'transport');
  assert.equal(suggestCategory('Metro card recharge'), 'transport');
  assert.equal(suggestCategory('Rent'), 'bills');
  assert.equal(suggestCategory('Electricity bill'), 'bills');
  assert.equal(suggestCategory('Jio recharge'), 'bills');
  assert.equal(suggestCategory('Sabzi'), 'groceries');
  assert.equal(suggestCategory('DMart'), 'groceries');
  assert.equal(suggestCategory('New shoes'), 'shopping');
  assert.equal(suggestCategory('Movie night'), 'fun');
});

test('specific lists win over general ones', () => {
  assert.equal(suggestCategory('Swiggy Instamart'), 'groceries');
  assert.equal(suggestCategory('Netflix'), 'subscription');
  assert.equal(suggestCategory('Amazon Prime'), 'subscription');
  assert.equal(suggestCategory("Domino's pizza"), 'food');
});

test('no partial-word or unknown matches', () => {
  assert.equal(suggestCategory('Olaf the snowman'), null);
  assert.equal(suggestCategory('Rental deposit refund'), null); // "rent" must not match "rental"
  assert.equal(suggestCategory('Sent to Ravi'), null);
  assert.equal(suggestCategory(''), null);
});
