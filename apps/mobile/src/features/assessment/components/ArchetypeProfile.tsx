import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { bandLabel, barPercent, DIMENSIONS, guideFor } from '@/features/assessment/archetypeGuide';
import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import type { ArchetypeCard, AssessmentResult } from '@/features/assessment/types';
import { buildTheme } from '@/features/theme/archetypeTheme';

function TraitCard({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <View style={styles.trait}>
      <View style={styles.traitTitle}>
        <View style={[styles.traitDot, { backgroundColor: dot }]} />
        <Text style={styles.label}>{title}</Text>
      </View>
      {items.map((item) => (
        <Text key={item} style={styles.traitItem}>
          {'•'} {item}
        </Text>
      ))}
    </View>
  );
}

function InsightRow({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, { color }]}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

function MixCard({ rank, card }: { rank: string; card: ArchetypeCard }) {
  const guide = guideFor(card.slug);
  return (
    <View style={[styles.mix, { borderLeftColor: guide.color }]}>
      <Text style={styles.label}>{rank}</Text>
      <Text style={styles.mixName}>{card.name}</Text>
      <Text style={styles.body}>{card.description}</Text>
      <Text style={[styles.body, { color: COLORS.muted, marginTop: 6 }]}>
        Strength: {card.strengths[0]} · Watch for: {card.blind_spots[0]}
      </Text>
    </View>
  );
}

function DimensionBar({ label, meaning, score, band, color }: {
  label: string;
  meaning: string;
  score: number | undefined;
  band: string | undefined;
  color: string;
}) {
  const pct = barPercent(score);
  return (
    <View
      style={{ gap: 6 }}
      accessible
      accessibilityLabel={`${label}: ${bandLabel(band) || 'not scored'}, ${pct} out of 100. ${meaning}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{label}</Text>
        <Text style={{ fontSize: 13, color: COLORS.muted }}>{bandLabel(band)}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: COLORS.track, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
      <Text style={{ fontSize: 12, color: COLORS.muted }}>{meaning}</Text>
    </View>
  );
}

/**
 * The full money profile: primary pattern with what drives it, what it needs and
 * where it grows; the secondary and tertiary patterns; and the six dimensions.
 */
export function ArchetypeProfile({ result }: { result: AssessmentResult }) {
  const { primary, secondary, tertiary } = result;
  const guide = guideFor(primary.slug);
  const theme = buildTheme(primary.slug);

  return (
    <View style={{ gap: 20 }}>
      <LinearGradient colors={[guide.color, theme.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>YOUR PRIMARY PATTERN</Text>
        </View>
        <Text style={styles.name} accessibilityRole="header">
          {primary.name}
        </Text>
        <Text style={styles.description}>{primary.description}</Text>
        <Text style={styles.question}>“{guide.question}”</Text>
      </LinearGradient>

      <View style={styles.traits}>
        <TraitCard title="Strengths" items={primary.strengths} dot={COLORS.sage} />
        <TraitCard title="Blind spots" items={primary.blind_spots} dot={COLORS.peach} />
      </View>

      <View style={styles.panel}>
        <InsightRow title="What drives you" body={guide.motivation} color={theme.accentText} />
        <InsightRow title="What you need" body={guide.coreNeed} color={theme.accentText} />
        <InsightRow title="Where you can grow" body={guide.growth} color={theme.accentText} />
        <View style={[styles.belief, { backgroundColor: `${guide.soft}55`, borderLeftColor: guide.color }]}>
          <Text style={styles.beliefText}>{guide.belief}</Text>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <Text style={styles.section}>Also in your mix</Text>
        <MixCard rank="SECONDARY PATTERN" card={secondary} />
        <MixCard rank="TERTIARY PATTERN" card={tertiary} />
      </View>

      <View style={[styles.panel, { gap: 16 }]}>
        <Text style={styles.section}>Your six dimensions</Text>
        {DIMENSIONS.map((d) => (
          <DimensionBar
            key={d.key}
            label={d.label}
            meaning={d.meaning}
            score={result.dimensions[d.key]}
            band={result.bands[d.key]}
            color={guide.color}
          />
        ))}
      </View>

      <Text style={styles.note}>
        This is the pattern CUE sees right now, not a fixed label. There is no best or worst
        pattern, and yours can shift as CUE learns from what you log.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 24 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: COLORS.cardDark },
  name: {
    marginTop: 18,
    fontSize: 34,
    lineHeight: 42,
    fontStyle: 'italic',
    color: COLORS.white,
    fontFamily: HEADING_FONT,
  },
  description: { marginTop: 14, fontSize: 15, lineHeight: 22, color: COLORS.white },
  question: { marginTop: 14, fontSize: 14, lineHeight: 20, fontStyle: 'italic', color: COLORS.cardDarkText },
  traits: { flexDirection: 'row', gap: 12 },
  trait: {
    flex: 1,
    padding: 16,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  traitTitle: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  traitDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  traitItem: { marginTop: 8, fontSize: 14, lineHeight: 20, color: COLORS.text },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.muted },
  body: { fontSize: 14, lineHeight: 21, color: COLORS.text },
  panel: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  belief: { borderLeftWidth: 3, borderRadius: 12, padding: 12 },
  beliefText: { fontSize: 15, lineHeight: 22, fontStyle: 'italic', color: COLORS.text, fontFamily: HEADING_FONT },
  section: { fontSize: 18, color: COLORS.text, fontFamily: HEADING_FONT },
  mix: {
    gap: 4,
    padding: 16,
    borderRadius: 20,
    borderLeftWidth: 4,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  mixName: { fontSize: 20, color: COLORS.text, fontFamily: HEADING_FONT },
  note: { fontSize: 13, lineHeight: 19, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 8 },
});
