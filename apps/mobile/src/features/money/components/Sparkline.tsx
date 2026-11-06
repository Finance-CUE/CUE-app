import { TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { COLORS } from '@/features/assessment/theme';
import { countPoints, linePoints } from '../chart';
import type { TrendPoint } from '../types';

/** Balance line (purple) and spending line (peach). Draws nothing for fewer than two points. */
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
  const balances = points.map((p) => p.balance_paise);
  const hasBalance = countPoints(balances) > 1;
  const balance = linePoints(balances, width, height);
  const spending = linePoints(points.map((p) => p.spent_paise), width, height, { zeroBaseline: true });
  const chart = (
    <Svg width={width} height={height}>
      {hasBalance ? (
        <Polyline points={balance} fill="none" stroke={COLORS.purple} strokeWidth={2} />
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
      activeOpacity={0.7}>
      {chart}
    </TouchableOpacity>
  );
}
