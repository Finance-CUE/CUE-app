import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARCHETYPE_GUIDES, bandLabel, barPercent, DIMENSIONS, guideFor } from './archetypeGuide.ts';

// Must match the slugs in apps/backend/app/features/assessment/archetypes.py.
const SLUGS = [
  'dreamer', 'comfort_spender', 'social_spender', 'thrill_chaser', 'prepared_one',
  'optimizer', 'outrunner', 'curator', 'autopilot', 'survival_saver',
];

test('every archetype has a full guide and a distinct colour', () => {
  assert.deepEqual(Object.keys(ARCHETYPE_GUIDES).sort(), [...SLUGS].sort());
  const colours = new Set(Object.values(ARCHETYPE_GUIDES).map((g) => g.color));
  assert.equal(colours.size, SLUGS.length);
  for (const g of Object.values(ARCHETYPE_GUIDES)) {
    for (const v of Object.values(g)) assert.ok(String(v).length > 0);
  }
});

test('unknown slugs fall back instead of crashing', () => {
  assert.ok(guideFor('nope').belief.length > 0);
  assert.ok(guideFor(undefined).color.startsWith('#'));
});

test('six dimensions and the backend band names', () => {
  assert.equal(DIMENSIONS.length, 6);
  for (const b of ['very_low', 'low', 'moderate', 'high', 'very_high']) assert.ok(bandLabel(b));
  assert.equal(barPercent(140), 100);
  assert.equal(barPercent(undefined), 0);
});
