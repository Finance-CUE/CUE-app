import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARCHETYPE_GUIDES } from '../assessment/archetypeGuide.ts';
import { buildTheme, NEUTRALS } from './archetypeTheme.ts';
import { contrast } from './color.ts';

test('every archetype gets readable text colours', () => {
  for (const slug of [...Object.keys(ARCHETYPE_GUIDES), null]) {
    const t = buildTheme(slug);
    assert.ok(contrast(t.accentText, NEUTRALS.background) >= 4.5, `${slug} accentText`);
    assert.ok(contrast('#FFFFFF', t.deep) >= 4.5, `${slug} white on deep`);
    assert.ok(contrast(t.linkOnDeep, t.deep) >= 4.5, `${slug} link on deep`);
  }
});

test('archetypes look different; no result falls back to CUE purple', () => {
  assert.notEqual(buildTheme('dreamer').accent, buildTheme('curator').accent);
  assert.equal(buildTheme(null).slug, null);
  assert.equal(buildTheme('unknown').slug, null);
  assert.equal(buildTheme('optimizer').slug, 'optimizer');
});
