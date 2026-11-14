import assert from 'node:assert/strict';
import { test } from 'node:test';

import { daysBefore, deviceTimeZone, formatDate, formatDateTime, spendDateProblem, toDisplayDate, toISODate, weekStartBack } from './dates.ts';

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

test('daysBefore and toDisplayDate', () => {
  assert.equal(daysBefore(new Date(2026, 2, 1), 1), '2026-02-28');
  assert.equal(toDisplayDate('2026-11-06'), '06/11/2026');
});

test('spendDateProblem rejects future, malformed and ancient dates', () => {
  const today = new Date(2026, 10, 14, 15);
  assert.equal(spendDateProblem('2026-11-14', today), null);
  assert.equal(spendDateProblem('2026-10-01', today), null);
  assert.match(spendDateProblem('2026-11-15', today) ?? '', /future/);
  assert.match(spendDateProblem(null, today) ?? '', /DD\/MM\/YYYY/);
  assert.match(spendDateProblem('1999-12-31', today) ?? '', /2000/);
});

test('weekStartBack steps whole weeks from this Monday', () => {
  const sat = new Date(2026, 10, 14); // Saturday
  assert.equal(toISODate(weekStartBack(sat, 0)), '2026-11-09');
  assert.equal(toISODate(weekStartBack(sat, 2)), '2026-10-26');
});
