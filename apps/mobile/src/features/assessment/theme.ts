import { Platform } from 'react-native';

// Values match the auth screens and were read from the Figma CUE frames.
export const COLORS = {
  // CUE Universal Brand Palette (Archetype Bible): the same for everyone.
  background: '#FAF7F2',
  text: '#2F2A27',
  muted: '#6B625C',
  border: '#D8CDC0',
  purple: '#8D80CC',
  purpleSoft: '#F1EFF8',
  track: '#ECE8EC',
  white: '#FFFFFF',
  sage: '#92A98A',
  peach: '#E39B80',
  cardDark: '#2F2A38',
  cardDarkText: '#D9D4DE',
  cardBorder: '#E7DED3',
  card: '#FFFDF9',
  error: '#C65F68',
  sageTint: '#EAF0E7',
  peachTint: '#FBEDE7',
  linkOnDark: '#B9AFE6',
} as const;

export const HEADING_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: undefined });
