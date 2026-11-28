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
};

function readable(color: string, on: string, min: number): string {
  let out = color;
  for (let step = 1; contrast(out, on) < min && step <= 10; step++) out = mix(color, NEUTRALS.text, step / 10);
  return out;
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
  };
}
