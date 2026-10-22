import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import type { AssessmentResult } from '@/features/assessment/types';

function Sparkle() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M12 2C12 8 16 12 22 12C16 12 12 16 12 22C12 16 8 12 2 12C8 12 12 8 12 2Z"
        stroke={COLORS.peach}
        strokeWidth={1.6}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TraitCard({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <View style={styles.trait}>
      <View style={styles.traitTitle}>
        <View style={[styles.traitDot, { backgroundColor: dot }]} />
        <Text style={styles.traitTitleText}>{title}</Text>
      </View>
      {items.map((item) => (
        <Text key={item} style={styles.traitItem}>
          {'•'} {item}
        </Text>
      ))}
    </View>
  );
}

export function ResultsScreen({
  result,
  onEnter,
}: {
  result: AssessmentResult;
  onEnter: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { primary } = result;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Your archetype</Text>

        <LinearGradient
          colors={[COLORS.cardDark, '#40384F']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>PRIMARY</Text>
            </View>
            <Sparkle />
          </View>
          <Text style={styles.name} accessibilityRole="header">
            {primary.name}
          </Text>
          <Text style={styles.description}>{primary.description}</Text>
        </LinearGradient>

        <View style={styles.traits}>
          <TraitCard title="Strengths" items={primary.strengths} dot={COLORS.sage} />
          <TraitCard title="Blind spots" items={primary.blind_spots} dot={COLORS.peach} />
        </View>
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
  card: { borderRadius: 28, padding: 24 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 11,
    backgroundColor: COLORS.peach,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: COLORS.cardDark },
  name: {
    marginTop: 20,
    fontSize: 34,
    lineHeight: 42,
    fontStyle: 'italic',
    color: COLORS.white,
    fontFamily: HEADING_FONT,
  },
  description: { marginTop: 16, fontSize: 15, lineHeight: 22, color: COLORS.cardDarkText },
  traits: { flexDirection: 'row', gap: 12, marginTop: 20 },
  trait: {
    flex: 1,
    padding: 16,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  traitTitle: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  traitDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  traitTitleText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  traitItem: { marginTop: 8, fontSize: 14, lineHeight: 20, color: COLORS.text },
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
