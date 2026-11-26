import { TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ROLES } from '@/features/money/palette';
import { linePath } from './model';

/**
 * The 30-day sparkline on the net worth card (suggestion 9): an accent line,
 * 32px high. Tapping it opens the chart at 30 days.
 */
export function MiniLine({
  values,
  width = 96,
  height = 32,
  onPress,
}: {
  values: number[];
  width?: number;
  height?: number;
  onPress?: () => void;
}) {
  if (values.length < 2) return null;
  const { line } = linePath(values, width, height, 3);
  const chart = (
    <Svg width={width} height={height}>
      <Path d={line} fill="none" stroke={ROLES.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
  if (!onPress) return <View>{chart}</View>;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Net worth, last 30 days. Opens the chart"
      onPress={onPress}
      hitSlop={10}
      activeOpacity={0.7}>
      {chart}
    </TouchableOpacity>
  );
}
