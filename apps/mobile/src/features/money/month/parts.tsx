import { Redirect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { useAuthStore } from '@/features/auth/store';
import { COLORS, FONT, ROLES, TYPE } from '@/features/money/palette';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { ScreenScroll } from '../components/ui';
import { usePrivacyStore } from '../privacy';
import { barScale, shortMonth } from './model';

/** Signed-in only; queries run in `children`, so they never fire while signed out. */
export function SignedIn({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'restoring') return null;
  if (status !== 'authenticated') return <Redirect href="/" />;
  return <>{children}</>;
}

/**
 * A full-screen detail page Today opens (spec, navigation map): back arrow,
 * title and the eye icon, so amounts can be hidden here too.
 */
export function DetailScreen({
  title,
  children,
  refreshing,
  onRefresh,
  overlay,
}: {
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Sheets and the Undo toast: outside the scroll, so the toast sits on the screen, not the content. */
  overlay?: ReactNode;
}) {
  const router = useRouter();
  const hidden = usePrivacyStore((s) => s.hidden);
  const toggle = usePrivacyStore((s) => s.toggle);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll refreshing={refreshing} onRefresh={onRefresh}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: ROLES.accent }}>‹ Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
            onPress={toggle}
            hitSlop={12}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
            {hidden ? <EyeOffIcon color={ROLES.accent} size={20} /> : <EyeIcon color={ROLES.accent} size={20} />}
          </TouchableOpacity>
        </View>
        <Text style={{ fontFamily: FONT.amount, fontSize: 26, color: COLORS.text }}>{title}</Text>
        {children}
      </ScreenScroll>
      {overlay}
    </View>
  );
}

/** The big number at the top of a detail screen, with an optional line under it. */
export function Headline({ label, amount, sub }: { label: string; amount: string; sub?: string | null }) {
  return (
    <View accessible accessibilityLabel={`${label}, ${amount}${sub ? `. ${sub}` : ''}`} style={{ gap: 2 }}>
      <Text style={{ ...TYPE.eyebrow, color: COLORS.muted }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...TYPE.hero, color: COLORS.text }}>
        {amount}
      </Text>
      {sub ? <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>{sub}</Text> : null}
    </View>
  );
}

/** A label and amount on one line, as in the breakdown tables. */
export function FigureRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, ${value}`}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: onPress ? 44 : 32 }}>
      <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text }}>
        {label}
        {onPress ? ' ›' : ''}
      </Text>
      <Text style={{ ...TYPE.rowAmount, fontSize: 14, color: COLORS.text }}>{value}</Text>
    </TouchableOpacity>
  );
}

/** Six monthly bars (oldest first), the current month in accent. */
export function MonthBars({
  points,
  color,
  label,
}: {
  points: { month: string; value: number; text: string }[];
  color: string;
  label: string;
}) {
  const scale = barScale(points.map((p) => p.value));
  return (
    <View accessible accessibilityLabel={`${label}: ${points.map((p) => `${shortMonth(p.month)} ${p.text}`).join(', ')}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 10 }}>
        {points.map((p, i) => (
          <View key={p.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View
              style={{
                width: '70%',
                height: `${Math.max(scale[i] * 100, p.value !== 0 ? 4 : 1)}%`,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: i === points.length - 1 ? color : `${color}88`,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        {points.map((p) => (
          <Text key={p.month} style={{ flex: 1, textAlign: 'center', fontFamily: FONT.regular, fontSize: 11, color: COLORS.muted }}>
            {shortMonth(p.month)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars, largest first, each tappable (Expenses by category). */
export function HBar({
  label,
  value,
  share,
  color,
  onPress,
}: {
  label: string;
  value: string;
  share: number;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, ${value}`}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={0.7}
      style={{ gap: 6, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: FONT.medium, fontSize: 13.5, color: COLORS.text }}>
          {label}
          {onPress ? ' ›' : ''}
        </Text>
        <Text style={{ ...TYPE.rowAmount, color: COLORS.text }}>{value}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: ROLES.line, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(share * 100, 2)}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
      </View>
    </TouchableOpacity>
  );
}
