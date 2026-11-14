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

test('instamart beats swiggy', () => {
  assert.equal(suggestCategory('Swiggy Instamart'), 'groceries');
});

test('no partial-word or unknown matches', () => {
  assert.equal(suggestCategory('Olaf the snowman'), null);
  assert.equal(suggestCategory('rent'), null);
  assert.equal(suggestCategory(''), null);
});
