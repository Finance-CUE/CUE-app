/**
 * Each archetype's "identity layer" over CUE's shared neutrals, per the Archetype
 * Bible's design principle: one calm world, ten personalities. Pure, so it is tested.
 */
import { ARCHETYPE_GUIDES } from '../assessment/archetypeGuide.ts';
import { contrast, mix } from './color.ts';

/** CUE Universal Brand Palette: identical for every user. */
export const NEUTRALS = {
  background: '#FAF7F2',
  text: '#2F2A27',
  muted: '#6B625C',
  border: '#E7DED3',
  card: '#FFFDF9',
} as const;

/** CUE's own colour, for signed-out screens and anyone without a result yet. */
const CUE_PURPLE = '#8D80CC';

/**
 * CUE brand kit (Dashboard spec, section 2). Hex values were sampled from the brand
 * kit image; confirm against the design source files.
 */
export const BRAND = {
  navy: '#2F4157',
  teal: '#377083',
  sky: '#67C1D9',
  lime: '#A5CF5F',
  ice: '#E1ECF2',
  white: '#FFFFFF',
} as const;

/**
 * The colour roles the dashboard asks for. Elements name a role, never a hex value.
 * An archetype may change only `bg`, `accent*` and `note*`; money and text colours
 * stay fixed so income looks the same for everyone and amounts stay readable.
 */
export type ColorRoles = {
  bg: string;
  card: string;
  ink: string;
  inkSoft: string;
  /** Eyebrow labels and decoration only: too faint for text people must read. */
  inkFaint: string;
  line: string;
  accent: string;
  accentSoft: string;
  /** Text and icons placed on `accent`. */
  onAccent: string;
  note: string;
  noteSoft: string;
  noteInk: string;
  /** Lime, for bars and fills. */
  positive: string;
  positiveSoft: string;
  /** Lime darkened for amounts shown as text (lime itself is about 1.8 : 1 on white). */
  positiveInk: string;
  attention: string;
  attentionSoft: string;
};

export type ArchetypeTheme = {
  slug: string | null;
  /** Archetype primary: fills, bars, highlights. */
  accent: string;
  /** Archetype secondary: gradients' far end, soft surfaces. */
  soft: string;
  /** A pale wash of the accent for selected chips and icon circles. */
  tint: string;
  /** Accent darkened until it reads as text on the background (WCAG AA, 4.5:1). */
  accentText: string;
  /** Deep shade for the hero card; white text sits on it. */
  deep: string;
  /** Muted light text and links on `deep`. */
  onDeep: string;
  linkOnDeep: string;
  /** Hero and progress gradient: deep → accent. */
  gradient: [string, string];
  /** The one question this archetype's home answers, and the belief CUE reinforces. */
  question: string;
  belief: string;
  /** Dashboard colour roles (brand kit base, themed by archetype). */
  roles: ColorRoles;
};

function readable(color: string, on: string, min: number): string {
  let out = color;
  for (let step = 1; contrast(out, on) < min && step <= 10; step++) out = mix(color, NEUTRALS.text, step / 10);
  return out;
}

/** Darkens `color` toward `toward` until it reaches `min` contrast against every colour in `on`. */
function darkenUntil(color: string, on: string[], min: number, toward: string): string {
  let out = color;
  for (let step = 1; on.some((c) => contrast(out, c) < min) && step <= 20; step++) {
    out = mix(color, toward, step / 20);
  }
  return out;
}

const tint = (color: string, amount: number) => mix(BRAND.white, color, amount);

export function buildRoles(primary: string | null, secondary: string | null): ColorRoles {
  const bg = primary ? tint(primary, 0.1) : BRAND.ice;
  // Text sits on the accent (white) and the accent is used as text on cards and bg.
  const accent = darkenUntil(primary ?? BRAND.teal, [BRAND.white, bg], 4.5, BRAND.navy);
  const note = secondary ?? BRAND.sky;
  const noteSoft = tint(note, 0.15);
  return {
    bg,
    card: BRAND.white,
    ink: BRAND.navy,
    // Navy at 70% lands just under 4.5 : 1 on white; nudged to pass (spec suggestion 25).
    inkSoft: darkenUntil(tint(BRAND.navy, 0.7), [BRAND.white], 4.5, BRAND.navy),
    inkFaint: tint(BRAND.navy, 0.45),
    line: tint(BRAND.navy, 0.12),
    accent,
    accentSoft: tint(accent, 0.12),
    onAccent: BRAND.white,
    note,
    noteSoft,
    noteInk: darkenUntil(BRAND.navy, [noteSoft], 4.5, '#000000'),
    positive: BRAND.lime,
    positiveSoft: tint(BRAND.lime, 0.18),
    positiveInk: darkenUntil(BRAND.lime, [BRAND.white], 4.5, '#1F3A12'),
    attention: BRAND.teal,
    attentionSoft: tint(BRAND.teal, 0.08),
  };
}

export function buildTheme(slug: string | null | undefined): ArchetypeTheme {
  const guide = (slug && ARCHETYPE_GUIDES[slug]) || null;
  const accent = guide ? guide.color : CUE_PURPLE;
  const soft = guide ? guide.soft : '#D9D4F0';
  const deep = mix(accent, '#1E1A1C', 0.55);
  return {
    slug: guide ? (slug ?? null) : null,
    accent,
    soft,
    tint: mix(soft, '#FFFFFF', 0.65),
    accentText: readable(accent, NEUTRALS.background, 4.5),
    deep,
    onDeep: mix(soft, '#FFFFFF', 0.55),
    linkOnDeep: readable(mix(soft, '#FFFFFF', 0.3), deep, 4.5),
    gradient: [deep, mix(accent, deep, 0.25)],
    question: guide?.question ?? 'What does my money say about me?',
    belief: guide?.belief ?? 'Small, steady steps change your money more than big resolutions.',
    roles: buildRoles(guide?.color ?? null, guide?.soft ?? null),
  };
}
