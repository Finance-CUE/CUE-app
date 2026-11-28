/**
 * The dashboard's colours and type (spec section 2): the CUE brand kit, navy and
 * teal, themed by the user's archetype. Screens ask for a role, never a hex
 * value. Same keys as the assessment palette, so every money screen moved over
 * by changing one import; sign-in and the assessment keep their own look.
 *
 * An archetype changes only the background tint, accent and note colours (with
 * their soft and ink variants); money and text colours stay fixed, so income
 * looks the same for everyone and amounts stay readable. Without a result, the
 * base brand kit is used.
 *
 * ROLES and COLORS hold the active theme. applyArchetype() fills them before
 * the dashboard renders; the tabs remount when the archetype changes, so every
 * screen redraws in the new colours.
 */
import { Platform } from 'react-native';

import { buildRoles, buildTheme, type ColorRoles } from '@/features/theme/archetypeTheme';
import { FONT } from '@/features/theme/fonts';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';

export const ROLES: ColorRoles = { ...buildRoles(null, null) };

function colorsFor(r: ColorRoles) {
  return {
    background: r.bg,
    text: r.ink,
    muted: r.inkSoft,
    faint: r.inkFaint,
    // Input outlines and chips: a step stronger than card lines, so fields read as fields.
    border: '#C9D0D7',
    purple: r.accent,
    purpleSoft: r.accentSoft,
    track: r.line,
    white: '#FFFFFF',
    sage: r.positive,
    peach: r.note,
    cardDark: r.ink,
    cardDarkText: '#D6DEE6',
    cardBorder: r.line,
    card: r.card,
    error: '#B8505A',
    sageTint: r.positiveSoft,
    peachTint: r.noteSoft,
    linkOnDark: '#9FD6E6',
  };
}

export const COLORS = colorsFor(ROLES);

let appliedSlug: string | null | undefined;

/**
 * Make `slug`'s theme the active one. Idempotent; call it during render, before
 * the dashboard's children, wherever the archetype is known.
 */
export function applyArchetype(slug: string | null): void {
  if (slug === appliedSlug) return;
  appliedSlug = slug;
  Object.assign(ROLES, buildTheme(slug).roles);
  Object.assign(COLORS, colorsFor(ROLES));
}

/** The active background at `alpha`, e.g. the bottom nav at 92%. */
export function bgAt(alpha: number): string {
  const hex = ROLES.bg.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Serif for amounts, the user's name and sheet titles (Newsreader in place of Gyst). */
export const HEADING_FONT = FONT.amount;

/** Money in, as text: lime itself is too faint on white. */
export const POSITIVE_INK = ROLES.positiveInk;

export { FONT };

/** Tabular figures so amounts line up in columns. */
export const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** The type scale (spec section 2). */
export const TYPE = {
  hero: { fontFamily: FONT.amount, fontSize: 40, ...TABULAR },
  cardAmount: { fontFamily: FONT.amount, fontSize: 26, ...TABULAR },
  name: { fontFamily: FONT.amount, fontSize: 20 },
  sectionTitle: { fontFamily: FONT.semibold, fontSize: 13 },
  eyebrow: {
    fontFamily: FONT.semibold,
    fontSize: 11.5,
    letterSpacing: 0.92,
    textTransform: 'uppercase' as const,
  },
  body: { fontFamily: FONT.medium, fontSize: 14 },
  meta: { fontFamily: FONT.regular, fontSize: 11 },
  rowAmount: { fontFamily: FONT.semibold, fontSize: 13, ...TABULAR },
} as const;

/** Shape and spacing (spec section 2). */
export const SHAPE = {
  sidePadding: 26,
  cardRadius: 22,
  cardPadding: 20,
  cardGap: 14,
  buttonRadius: 16,
  iconTile: 34,
  iconRadius: 10,
  fab: 54,
  fabBottom: 92,
} as const;

/** A soft shadow for the FAB and floating bars. */
export const SOFT_SHADOW = Platform.select({
  ios: { shadowColor: ROLES.ink, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  default: { elevation: 6 },
});

/**
 * The user's archetype theme in dashboard roles: accents in the archetype's
 * colour (made readable on white), plus its words (question, belief).
 */
export function useDashboardTheme() {
  const theme = useArchetypeTheme();
  applyArchetype(theme.slug);
  return {
    ...theme,
    accent: ROLES.accent,
    accentText: ROLES.accent,
    tint: ROLES.accentSoft,
    deep: ROLES.ink,
    roles: ROLES,
  };
}
