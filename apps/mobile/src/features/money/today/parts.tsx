import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';

import { COLORS, FONT, SHAPE, TYPE, useDashboardTheme } from '@/features/money/palette';

/** Eyebrow label: small capitals, as on "YOUR NET WORTH". */
export function Eyebrow({ children }: { children: string }) {
  // Spec: ink-faint; ink-soft here because people read these labels (suggestion 25).
  return <Text style={{ ...TYPE.eyebrow, color: COLORS.muted }}>{children}</Text>;
}

/** Grey blocks in the card's own shape with a slow shimmer; never placeholder numbers. */
export function Skeleton({ lines }: { lines: { width: ViewStyle['width']; height: number }[] }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ gap: 10, opacity: pulse }} accessibilityLabel="Loading">
      {lines.map((l, i) => (
        <View key={i} style={{ width: l.width, height: l.height, borderRadius: 6, backgroundColor: COLORS.track }} />
      ))}
    </Animated.View>
  );
}

/** "Couldn't load your accounts." with Try again; the card keeps its title. */
export function CardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useDashboardTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{message}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onRetry} hitSlop={10} style={{ alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: theme.accentText }}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Empty state: a line icon in accent, the copy in 13px muted, and one light button. */
export function EmptyState({
  icon,
  text,
  action,
  onAction,
}: {
  icon?: ReactNode;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      {icon}
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, textAlign: 'center' }}>{text}</Text>
      {action && onAction ? <LightButton label={action} onPress={onAction} /> : null}
    </View>
  );
}

/** "View breakdown": a light filled button. */
export function LightButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useDashboardTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.7}
      style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: SHAPE.buttonRadius, backgroundColor: theme.tint, justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: theme.accentText }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** "Update balance", "Accounts": ghost chips. */
export function GhostChip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useDashboardTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: SHAPE.buttonRadius,
        borderWidth: 1,
        borderColor: COLORS.border,
        justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: theme.accentText }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A white card with a title row, used by every Today block. */
export function TodayCard({
  title,
  right,
  children,
  style,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        { backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, borderWidth: 1, borderRadius: SHAPE.cardRadius, padding: SHAPE.cardPadding, gap: 12 },
        style,
      ]}>
      {title || right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {typeof title === 'string' ? (
            <Text style={{ ...TYPE.sectionTitle, color: COLORS.text }}>{title}</Text>
          ) : (
            title
          )}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}
