/**
 * The dashboard's colours and type (spec section 2): the CUE brand kit, navy and
 * teal. Screens ask for a role, never a hex value. Same keys as the assessment
 * palette, so every money screen moved over by changing one import; sign-in and
 * the assessment keep their own look.
 *
 * P1 uses the base values for everyone. Archetype theming (P4) will fill the
 * themed roles from buildTheme(slug).roles instead of BASE.
 */
import { Platform } from 'react-native';

import { buildRoles, type ColorRoles } from '@/features/theme/archetypeTheme';
import { FONT } from '@/features/theme/fonts';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';

export const ROLES: ColorRoles = buildRoles(null, null);

export const COLORS = {
  background: ROLES.bg,
  text: ROLES.ink,
  muted: ROLES.inkSoft,
  faint: ROLES.inkFaint,
  // Input outlines and chips: a step stronger than card lines, so fields read as fields.
  border: '#C9D0D7',
  purple: ROLES.accent,
  purpleSoft: ROLES.accentSoft,
  track: ROLES.line,
  white: '#FFFFFF',
  sage: ROLES.positive,
  peach: ROLES.note,
  cardDark: ROLES.ink,
  cardDarkText: '#D6DEE6',
  cardBorder: ROLES.line,
  card: ROLES.card,
  error: '#B8505A',
  sageTint: ROLES.positiveSoft,
  peachTint: ROLES.noteSoft,
  linkOnDark: '#9FD6E6',
} as const;

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
 * The archetype theme with the dashboard's base colours over it: accents are
 * teal for everyone in P1 (archetype colours arrive in P4); the archetype's
 * words (question, belief) still come through.
 */
export function useDashboardTheme() {
  const theme = useArchetypeTheme();
  return {
    ...theme,
    accent: ROLES.accent,
    accentText: ROLES.accent,
    tint: ROLES.accentSoft,
    deep: ROLES.ink,
    roles: ROLES,
  };
}
