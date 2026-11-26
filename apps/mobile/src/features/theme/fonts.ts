// One import per weight: the package index would bundle every weight it has.
import { LexendDeca_400Regular } from '@expo-google-fonts/lexend-deca/400Regular';
import { LexendDeca_500Medium } from '@expo-google-fonts/lexend-deca/500Medium';
import { LexendDeca_600SemiBold } from '@expo-google-fonts/lexend-deca/600SemiBold';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';

/**
 * Dashboard type (spec section 2): Lexend Deca for text; a serif for amounts and
 * the user's name. The spec names Gyst Variable, which isn't available, so
 * Newsreader stands in: a free variable serif in the same spirit, with tabular
 * figures. To switch later, add the font here and point `amount` at it.
 */
export const FONT_ASSETS = {
  LexendDeca_400Regular,
  LexendDeca_500Medium,
  LexendDeca_600SemiBold,
  Newsreader_400Regular,
  Newsreader_500Medium,
};

export const FONT = {
  /** Meta text (11px / 400). */
  regular: 'LexendDeca_400Regular',
  /** Body and rows (13–14px / 500). */
  medium: 'LexendDeca_500Medium',
  /** Section titles, eyebrows and row amounts (600). */
  semibold: 'LexendDeca_600SemiBold',
  /** Hero and card amounts, the user's name, sheet titles. */
  amount: 'Newsreader_400Regular',
  /** The same serif a little heavier, for titles on screens. */
  amountMedium: 'Newsreader_500Medium',
} as const;
