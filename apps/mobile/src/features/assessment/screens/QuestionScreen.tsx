import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';

interface QuestionScreenProps<T extends string | number> {
  part: string;
  step: number;
  total: number;
  question: string;
  options: { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
  onContinue: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function QuestionScreen<T extends string | number>({
  part,
  step,
  total,
  question,
  options,
  selected,
  onSelect,
  onContinue,
  isSubmitting,
  error,
}: QuestionScreenProps<T>) {
  const insets = useSafeAreaInsets();
  const canContinue = selected !== null && !isSubmitting;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <View style={styles.progressRow}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
        </View>
        <Text style={styles.counter}>
          {step} / {total}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.part}>{part}</Text>
        <Text style={styles.question} accessibilityRole="header">
          {question}
        </Text>

        <View style={styles.options} accessibilityRole="radiogroup">
          {options.map((option) => {
            const isSelected = option.value === selected;

            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                onPress={() => onSelect(option.value)}
                style={[styles.option, isSelected && styles.optionSelected]}>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          disabled={!canContinue}
          onPress={onContinue}
          style={[styles.button, !canContinue && styles.buttonDisabled]}>
          {isSubmitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.buttonLabel}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 24 },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: COLORS.purple },
  counter: { marginLeft: 16, fontSize: 14, color: COLORS.muted },
  scroll: { flex: 1 },
  body: { paddingTop: 24, paddingBottom: 24 },
  part: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginBottom: 12,
  },
  question: {
    fontSize: 28,
    lineHeight: 38,
    color: COLORS.text,
    fontFamily: HEADING_FONT,
    marginBottom: 24,
  },
  options: { gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  optionSelected: { borderColor: COLORS.purple, backgroundColor: COLORS.purpleSoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: { borderColor: COLORS.purple },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.purple },
  optionLabel: { flex: 1, fontSize: 15, color: COLORS.text },
  footer: { paddingTop: 8 },
  error: { fontSize: 13, color: COLORS.error, textAlign: 'center', marginBottom: 8 },
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.text,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});
