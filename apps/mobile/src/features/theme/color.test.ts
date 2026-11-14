import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contrast, mix } from './color.ts';

test('mix blends linearly between two colours', () => {
  assert.equal(mix('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mix('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
});

test('contrast matches WCAG for black on white', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21);
});
