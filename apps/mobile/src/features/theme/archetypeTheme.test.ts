import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARCHETYPE_GUIDES } from '../assessment/archetypeGuide.ts';
import { BRAND, buildTheme, NEUTRALS } from './archetypeTheme.ts';
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

const SLUGS = [...Object.keys(ARCHETYPE_GUIDES), null];

test('dashboard roles: no archetype uses the brand kit as is', () => {
  const r = buildTheme(null).roles;
  assert.equal(r.bg, BRAND.ice);
  assert.equal(r.accent, BRAND.teal);
  assert.equal(r.note, BRAND.sky);
  assert.equal(r.ink, BRAND.navy);
  assert.equal(r.card, '#FFFFFF');
});

test('dashboard roles: an archetype changes only bg, accent and note', () => {
  const base = buildTheme(null).roles;
  for (const slug of Object.keys(ARCHETYPE_GUIDES)) {
    const r = buildTheme(slug).roles;
    for (const fixed of ['card', 'ink', 'inkSoft', 'inkFaint', 'line', 'positive', 'positiveSoft', 'positiveInk', 'attention', 'attentionSoft'] as const) {
      assert.equal(r[fixed], base[fixed], `${slug} ${fixed}`);
    }
    assert.notEqual(r.note, base.note, `${slug} note is themed`);
  }
});

test('dashboard roles: every theme passes 4.5 : 1 for its text pairs', () => {
  for (const slug of SLUGS) {
    const r = buildTheme(slug).roles;
    assert.ok(contrast(r.onAccent, r.accent) >= 4.5, `${slug} text on accent`);
    assert.ok(contrast(r.accent, r.card) >= 4.5, `${slug} accent text on card`);
    assert.ok(contrast(r.accent, r.bg) >= 4.5, `${slug} accent text on bg`);
    assert.ok(contrast(r.noteInk, r.noteSoft) >= 4.5, `${slug} note-ink on note-soft`);
    assert.ok(contrast(r.inkSoft, r.card) >= 4.5, `${slug} ink-soft on card`);
    assert.ok(contrast(r.positiveInk, r.card) >= 4.5, `${slug} money-in text on card`);
  }
});
