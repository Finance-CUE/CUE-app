import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';

export function IntroScreen({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]}>
      <LinearGradient
        colors={[COLORS.sage, COLORS.purple]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.illustration}>
        <View style={styles.bars}>
          <View style={[styles.bar, { height: 18 }]} />
          <View style={[styles.bar, { height: 34 }]} />
          <View style={[styles.bar, { height: 52 }]} />
        </View>
      </LinearGradient>

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Before we begin</Text>
        <Text style={styles.heading}>
          Most finance apps show you <Text style={styles.accent}>numbers.</Text> We want to show
          you <Text style={styles.accent}>yourself.</Text>
        </Text>
        <Text style={styles.body}>
          Take a short, 2-minute empathetic assessment to discover your financial archetype and
          build custom goals.
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        onPress={onStart}
        style={styles.button}>
        <Text style={styles.buttonLabel}>Start the assessment</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 24 },
  illustration: {
    height: 190,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, height: 52 },
  bar: { width: 3, borderRadius: 2, backgroundColor: COLORS.white },
  copy: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginBottom: 12,
  },
  heading: {
    fontSize: 32,
    lineHeight: 39,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: HEADING_FONT,
  },
  accent: { fontStyle: 'italic', color: COLORS.purple },
  body: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: COLORS.muted,
  },
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.text,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});
