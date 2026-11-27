import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { useRupees } from '../privacy';
import type { Jar } from '../types';
import { byDate, jarTag, savedOfTarget, type Tag } from './model';

/** Card size from the spec: 160 × 150, 12px apart. */
export const JAR_CARD = { width: 160, height: 150, gap: 12 };

/**
 * One jar in the carousel (spec 4.7): icon in an accent-soft circle, name,
 * "₹12,000 / ₹30,000", a 6px progress bar, the percentage and "by 15 Mar".
 */
export function JarCard({ jar, onPress }: { jar: Jar; onPress: () => void }) {
  const formatRupees = useRupees();
  const tag = jarTag(jar);
  const paused = jar.state === 'paused';
  const done = jar.state === 'complete';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${jar.name}, ${savedOfTarget(jar, formatRupees)}, ${jar.progress}%${byDate(jar) ? `, ${byDate(jar)}` : ''}${tag ? `. ${tag.label}` : ''}`}
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: JAR_CARD.width,
        height: JAR_CARD.height,
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        padding: 14,
        justifyContent: 'space-between',
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: ROLES.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 18 }}>{jar.icon}</Text>
        </View>
        {tag ? <TagPill tag={tag} small /> : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.text }}>
          {jar.name}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONT.medium, fontSize: 12, color: COLORS.muted, fontVariant: ['tabular-nums'] }}>
          {savedOfTarget(jar, formatRupees)}
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <ProgressBar progress={jar.progress} paused={paused} done={done} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: COLORS.text }}>{jar.progress}%</Text>
          {byDate(jar) ? <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.muted }}>{byDate(jar)}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** A 6px bar on a line track: accent, faint while paused, full when reached. */
export function ProgressBar({ progress, paused, done, height = 6 }: { progress: number; paused?: boolean; done?: boolean; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: ROLES.line, overflow: 'hidden' }}>
      <View
        style={{
          width: `${done ? 100 : Math.max(progress, progress > 0 ? 3 : 0)}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: paused ? ROLES.inkFaint : ROLES.accent,
        }}
      />
    </View>
  );
}

export function TagPill({ tag, small }: { tag: Tag; small?: boolean }) {
  const look = {
    attention: { bg: ROLES.attentionSoft, ink: ROLES.attention },
    muted: { bg: ROLES.line, ink: COLORS.muted },
    positive: { bg: ROLES.positiveSoft, ink: ROLES.positiveInk },
  }[tag.tone];
  return (
    <View style={{ backgroundColor: look.bg, borderRadius: 10, paddingHorizontal: small ? 6 : 8, paddingVertical: 2, maxWidth: small ? 92 : undefined }}>
      <Text numberOfLines={1} style={{ fontFamily: FONT.semibold, fontSize: small ? 10 : 11.5, color: look.ink }}>
        {tag.label}
      </Text>
    </View>
  );
}
