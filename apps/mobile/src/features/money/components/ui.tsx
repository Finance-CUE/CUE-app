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

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
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
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 120, gap: 20 }}
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
  avatarColor = COLORS.purple,
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
  const avatarStyle: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: avatarColor,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const avatarContent = avatarUri ? (
    <Image source={{ uri: avatarUri }} style={{ width: 44, height: 44 }} />
  ) : (
    <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '600' }}>{avatarLetter}</Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: COLORS.muted }}>{eyebrow}</Text>
        <Text style={{ fontSize: 28, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>{title}</Text>
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
      <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, fontFamily: HEADING_FONT }}>{title}</Text>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.white,
          borderColor: COLORS.cardBorder,
          borderWidth: 1,
          borderRadius: 18,
          padding: 16,
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
      <Text style={{ color: COLORS.muted, fontSize: 14 }}>{text}</Text>
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
        <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: COLORS.muted }}>{subtitle}</Text> : null}
      </View>
      {amount ? <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>{amount}</Text> : null}
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
        height: 52,
        borderRadius: 26,
        backgroundColor: COLORS.text,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: off ? 0.4 : 1,
      }}>
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '600' }}>{label}</Text>
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
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
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
      <Text style={{ fontSize: 13, color: COLORS.muted }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 52,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.white,
        }}>
        {prefix ? <Text style={{ fontSize: 16, color: COLORS.muted, marginRight: 6 }}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={{ flex: 1, fontSize: 16, color: COLORS.text }}
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
              borderColor: active ? COLORS.purple : COLORS.border,
              backgroundColor: active ? COLORS.purpleSoft : COLORS.white,
            }}>
            <Text style={{ fontSize: 14, color: COLORS.text, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
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
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        position: 'absolute',
        right: 24,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: COLORS.text,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <PlusIcon color={COLORS.white} size={24} />
    </TouchableOpacity>
  );
}
