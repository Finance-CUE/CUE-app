import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

import { COLORS } from '@/features/assessment/theme';
import { InsightsIcon, KhataIcon, TodayIcon, YouIcon } from './icons';

const ICONS = { today: TodayIcon, insights: InsightsIcon, khata: KhataIcon, you: YouIcon };
const LABELS = { today: 'Today', insights: 'Insights', khata: 'Khata', you: 'You' };
type TabName = keyof typeof ICONS;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.cardBorder,
        paddingTop: 8,
        paddingHorizontal: 12,
        paddingBottom: Math.max(insets.bottom, 8),
      }}>
      {state.routes.map((route, index) => {
        const name = route.name as TabName;
        const Icon = ICONS[name];
        if (!Icon) return null;
        const focused = state.index === index;
        const color = focused ? COLORS.text : COLORS.muted;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          // The pill is the touchable itself: a plain View child here rendered
          // square on Android, ignoring borderRadius.
          <View key={route.key} style={styles.slot}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={[styles.pill, focused ? styles.pillActive : null]}>
              <Icon color={color} />
              <Text maxFontSizeMultiplier={1.4} style={{ fontSize: 11, fontWeight: focused ? '600' : '500', color }}>{LABELS[name]}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center' },
  pill: {
    width: 72,
    minHeight: 48,
    paddingVertical: 6,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pillActive: { backgroundColor: COLORS.purpleSoft },
});
