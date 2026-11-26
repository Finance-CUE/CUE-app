import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  type KeyboardTypeOptions,
  ScrollView,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT, HEADING_FONT, SHAPE, SOFT_SHADOW, useDashboardTheme } from '@/features/money/palette';
import { useAuthStore } from '@/features/auth/store';
import { PlusIcon } from './icons';

export function ScreenScroll({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: SHAPE.sidePadding, paddingBottom: 120, gap: SHAPE.cardGap }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  avatarLetter,
  avatarColor,
  avatarUri,
  onAvatarPress,
  avatarName,
}: {
  eyebrow: string;
  title: string;
  avatarLetter?: string;
  avatarColor?: string;
  avatarUri?: string;
  onAvatarPress?: () => void;
  avatarName?: string;
}) {
  const theme = useDashboardTheme();
  const avatarFill = avatarColor ?? theme.accent;
  const avatarStyle: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: avatarFill,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const avatarContent = avatarUri ? (
    <Image source={{ uri: avatarUri }} style={{ width: 44, height: 44 }} />
  ) : (
    <Text style={{ fontFamily: FONT.semibold, color: COLORS.white, fontSize: 18 }}>{avatarLetter}</Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.muted }}>{eyebrow}</Text>
        <Text style={{ fontSize: 28, color: COLORS.text, fontFamily: HEADING_FONT }}>{title}</Text>
      </View>
      {avatarLetter || avatarUri ? (
        onAvatarPress ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={avatarName ? `Your profile, ${avatarName}` : 'Your profile'}
            hitSlop={4}
            onPress={onAvatarPress}
            activeOpacity={0.7}
            style={avatarStyle}>
            {avatarContent}
          </TouchableOpacity>
        ) : (
          <View style={avatarStyle}>{avatarContent}</View>
        )
      ) : null}
    </View>
  );
}

/** Props for ScreenHeader's avatar on tabs that link to the You tab. */
export function useProfileAvatar() {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.user?.full_name)?.trim() ?? '';
  return {
    avatarLetter: (fullName[0] ?? 'C').toUpperCase(),
    avatarName: fullName,
    onAvatarPress: () => router.navigate('/you'),
  };
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 16, color: COLORS.text, fontFamily: HEADING_FONT }}>{title}</Text>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderColor: COLORS.cardBorder,
          borderWidth: 1,
          borderRadius: SHAPE.cardRadius,
          padding: SHAPE.cardPadding,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function EmptyCard({ text }: { text: string }) {
  return (
    <Card>
      <Text style={{ fontFamily: FONT.medium, color: COLORS.muted, fontSize: 14 }}>{text}</Text>
    </Card>
  );
}

export function Row({
  left,
  title,
  subtitle,
  amount,
  onPress,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: string;
  amount?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>{subtitle}</Text> : null}
      </View>
      {amount ? <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: COLORS.text }}>{amount}</Text> : null}
    </TouchableOpacity>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        minHeight: 52,
        borderRadius: SHAPE.buttonRadius,
        backgroundColor: COLORS.text,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: off ? 0.4 : 1 }}>
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <Text style={{ fontFamily: FONT.semibold, color: COLORS.white, fontSize: 16 }}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        minHeight: 52,
        borderRadius: SHAPE.buttonRadius,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.semibold, color: COLORS.text, fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  prefix,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  prefix?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 52,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.white }}>
        {prefix ? <Text style={{ fontFamily: FONT.medium, fontSize: 16, color: COLORS.muted, marginRight: 6 }}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={{ fontFamily: FONT.medium, flex: 1, fontSize: 16, color: COLORS.text }}
        />
      </View>
    </View>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const theme = useDashboardTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            activeOpacity={0.7}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: active ? theme.accent : COLORS.border,
              backgroundColor: active ? theme.tint : COLORS.card }}>
            <Text style={{ fontFamily: active ? FONT.semibold : FONT.medium, fontSize: 14, color: active ? theme.accentText : COLORS.text }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Fab({
  onPress,
  accessibilityLabel = 'Log a spend',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useDashboardTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        position: 'absolute',
        // Spec: 92px from the bottom of the screen; the 64px tab bar sits below this view.
        right: 26,
        bottom: SHAPE.fabBottom - 64,
        width: SHAPE.fab,
        height: SHAPE.fab,
        borderRadius: SHAPE.fab / 2,
        backgroundColor: theme.roles.ink,
        alignItems: 'center',
        justifyContent: 'center',
        ...SOFT_SHADOW }}>
      <PlusIcon color={COLORS.white} size={24} />
    </TouchableOpacity>
  );
}
