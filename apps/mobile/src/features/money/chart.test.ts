import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countPoints, linePoints } from './chart.ts';

test('scales values into the box, y inverted', () => {
  assert.equal(linePoints([0, 10], 100, 50), '0.0,50.0 100.0,0.0');
});

test('nulls are skipped but keep their x slot', () => {
  assert.equal(linePoints([0, null, 10], 100, 50), '0.0,50.0 100.0,0.0');
});

test('flat series is centred; empty gives empty', () => {
  assert.equal(linePoints([5, 5, 5], 100, 50), '0.0,25.0 50.0,25.0 100.0,25.0');
  assert.equal(linePoints([null, null], 100, 50), '');
  assert.equal(linePoints([], 100, 50), '');
});

test('zeroBaseline puts an all-zero series on the bottom edge', () => {
  assert.equal(linePoints([0, 0], 100, 50, { zeroBaseline: true }), '0.0,50.0 100.0,50.0');
  assert.equal(linePoints([5, 5], 100, 50, { zeroBaseline: true }), '0.0,25.0 100.0,25.0');
});

test('countPoints counts non-null values', () => {
  assert.equal(countPoints([null, 1, null, 0]), 2);
  assert.equal(countPoints([]), 0);
});
