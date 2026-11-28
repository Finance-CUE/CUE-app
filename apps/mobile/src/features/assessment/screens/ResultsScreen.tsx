import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArchetypeProfile } from '@/features/assessment/components/ArchetypeProfile';
import { COLORS } from '@/features/assessment/theme';
import type { AssessmentResult } from '@/features/assessment/types';

export function ResultsScreen({
  result,
  onEnter,
}: {
  result: AssessmentResult;
  onEnter: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Your money profile</Text>
        <ArchetypeProfile result={result} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          onPress={onEnter}
          style={styles.button}>
          <Text style={styles.buttonLabel}>Enter CUE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 24 },
  body: { paddingBottom: 24 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginBottom: 20,
  },
  footer: { paddingTop: 8 },
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.text,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});
