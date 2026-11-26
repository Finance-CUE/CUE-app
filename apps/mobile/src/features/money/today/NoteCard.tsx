import { Text, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';

/**
 * Brand-kit note colours (spec section 2): note-soft is sky at 15% on white,
 * note-ink the navy that reads on it at 4.5:1 or better. P1's colour roles
 * replace these constants.
 */
const NOTE_SOFT = '#E8F6FA';
const NOTE_INK = '#2F4157';

/**
 * Spec 4.10, P0 empty state only: until there is about a week of entries,
 * the note says so instead of inventing an observation. Real notes, with
 * Understand this, View insights and Ask CUE, come in P4.
 */
export function NoteCard() {
  return (
    <View accessible style={{ backgroundColor: NOTE_SOFT, borderRadius: 18, padding: 16, gap: 6 }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 1.2, color: NOTE_INK }}>A NOTE FROM CUE</Text>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13.3, color: COLORS.text }}>CUE is getting to know your patterns.</Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.8, color: NOTE_INK }}>Your first note arrives after a week of logging.</Text>
    </View>
  );
}
