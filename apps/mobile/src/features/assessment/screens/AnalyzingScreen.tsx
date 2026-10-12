import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { COLORS } from '@/features/assessment/theme';

export function AnalyzingScreen() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.screen} accessibilityRole="progressbar" accessibilityLabel="Reading your patterns">
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={120} height={120}>
          <Defs>
            <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={COLORS.purple} />
              <Stop offset="1" stopColor={COLORS.peach} />
            </SvgGradient>
          </Defs>
          <Circle cx={60} cy={60} r={54} stroke="url(#ring)" strokeWidth={12} fill="none" />
        </Svg>
      </Animated.View>
      <Text style={styles.label}>Reading your patterns, not judging them...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  label: { marginTop: 40, fontSize: 16, color: COLORS.muted, textAlign: 'center' },
});
