import assert from 'node:assert/strict';
import { test } from 'node:test';

import { weeklyReflection } from './reflection.ts';

const s = (spent_on: string, amount_paise: number, category: string) =>
  ({ id: spent_on + amount_paise, description: 'x', amount_paise, category, spent_on, created_at: '' }) as never;

// Fri 6 Nov 2026: this week starts Mon 2 Nov, last week Mon 26 Oct.
const today = new Date(2026, 10, 6);

test('splits this week and last week, picks top category', () => {
  const r = weeklyReflection(
    [s('2026-11-02', 100, 'food'), s('2026-11-05', 300, 'fun'), s('2026-11-01', 700, 'food'), s('2026-10-26', 50, 'food'), s('2026-10-20', 999, 'food')],
    today,
  );
  assert.deepEqual(r, { thisWeekPaise: 400, lastWeekPaise: 750, topCategory: 'fun', count: 2 });
});

test('empty week has no top category', () => {
  assert.deepEqual(weeklyReflection([], today), { thisWeekPaise: 0, lastWeekPaise: 0, topCategory: null, count: 0 });
});
