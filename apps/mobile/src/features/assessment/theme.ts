import { Platform } from 'react-native';

// Values match the auth screens and were read from the Figma CUE frames.
export const COLORS = {
  background: '#FAF8F6',
  text: '#292531',
  muted: '#918C95',
  border: '#D0CBD2',
  purple: '#8D80CC',
  purpleSoft: '#F1EFF8',
  track: '#ECE8EC',
  white: '#FFFFFF',
  sage: '#92A98A',
  peach: '#E39B80',
  cardDark: '#2F2A38',
  cardDarkText: '#D9D4DE',
  cardBorder: '#ECE7EB',
  error: '#C65F68',
  sageTint: '#EAF0E7',
  peachTint: '#FBEDE7',
  linkOnDark: '#B9AFE6',
} as const;

export const HEADING_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: undefined });
