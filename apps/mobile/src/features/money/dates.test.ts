import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deviceTimeZone, formatDate, formatDateTime } from './dates.ts';

process.env.TZ = 'Asia/Kolkata';

test('formatDate renders a calendar date', () => {
  assert.equal(formatDate('2026-11-06'), '6 Nov 2026');
  assert.equal(formatDate('2026-01-31'), '31 Jan 2026');
});

test('formatDateTime renders UTC ISO in the device zone', () => {
  assert.equal(formatDateTime('2026-11-06T10:00:00Z'), '6 Nov 2026, 3:30 pm');
  assert.equal(formatDateTime('2026-11-06T18:30:00Z'), '7 Nov 2026, 12:00 am');
});

test('deviceTimeZone is an IANA name', () => {
  assert.match(deviceTimeZone(), /^[A-Za-z_]+\/[A-Za-z_]+$/);
});
