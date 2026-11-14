import { TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { COLORS } from '@/features/assessment/theme';
import { countPoints, linePoints } from '../chart';
import type { TrendPoint } from '../types';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';

/**
 * Balance line (purple) and spending line (peach). A single known balance (the first
 * day) draws as a flat line ending in a dot, so day one never looks broken.
 */
export function Sparkline({
  points,
  width = 96,
  height = 36,
  onPress,
}: {
  points: TrendPoint[];
  width?: number;
  height?: number;
  onPress?: () => void;
}) {
  const theme = useArchetypeTheme();
  const balances = points.map((p) => p.balance_paise);
  const known = countPoints(balances);
  const hasBalance = known > 1;
  const balance = linePoints(balances, width, height);
  const spending = linePoints(points.map((p) => p.spent_paise), width, height, { zeroBaseline: true });
  const chart = (
    <Svg width={width} height={height}>
      {hasBalance ? (
        <Polyline points={balance} fill="none" stroke={theme.accent} strokeWidth={2} />
      ) : known === 1 ? (
        <>
          <Line x1={0} y1={height / 2} x2={width - 4} y2={height / 2} stroke={theme.accent} strokeWidth={2} strokeDasharray="4 4" />
          <Circle cx={width - 4} cy={height / 2} r={4} fill={theme.accent} />
        </>
      ) : null}
      {points.length > 1 && spending ? (
        <Polyline points={spending} fill="none" stroke={COLORS.peach} strokeWidth={2} />
      ) : null}
    </Svg>
  );
  if (!onPress) return <View>{chart}</View>;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Balance and spending trend. Opens net worth"
      onPress={onPress}
      hitSlop={12}
      activeOpacity={0.7}
      style={{ paddingVertical: 6 }}>
      {chart}
    </TouchableOpacity>
  );
}
