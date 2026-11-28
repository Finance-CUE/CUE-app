import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { useRupees } from '../privacy';
import type { CashFlowBucket, CashFlowPeriod } from '../types';
import { barLayout, bucketLabel, lineYs, runningRemaining } from './model';

const HEIGHT = 120;
const BAR = 9;

/**
 * Paired bars per period (spec 4.6): income in positive, expenses in note, with
 * an accent line for the running remaining amount. No y-axis labels; tapping a
 * bar selects it (the card shows its values in the strip below).
 */
export function CashFlowChart({
  buckets,
  period,
  width,
  selected,
  highlight,
  onSelect,
}: {
  buckets: CashFlowBucket[];
  period: CashFlowPeriod;
  width: number;
  selected: number | null;
  /** The date selected on Today, highlighted when it is in the chart. */
  highlight: number;
  onSelect: (index: number) => void;
}) {
  const formatRupees = useRupees();
  const bars = barLayout(buckets, width, HEIGHT - 8);
  const ys = lineYs(runningRemaining(buckets), HEIGHT);
  const line = bars.map((b, i) => `${(b.x + b.slot / 2).toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <View>
      <View style={{ width, height: HEIGHT }}>
        <Svg width={width} height={HEIGHT} style={{ position: 'absolute' }}>
          {bars.map((b, i) =>
            i === highlight || i === selected ? (
              <Rect key={`bg${i}`} x={b.x + 2} y={0} width={b.slot - 4} height={HEIGHT} rx={8} fill={ROLES.accentSoft} />
            ) : null,
          )}
          {bars.map((b, i) => {
            const mid = b.x + b.slot / 2;
            return [
              b.incomeH > 0 ? (
                <Rect key={`i${i}`} x={mid - BAR - 1} y={HEIGHT - b.incomeH} width={BAR} height={b.incomeH} rx={4} fill={ROLES.positive} />
              ) : null,
              b.expenseH > 0 ? (
                <Rect key={`e${i}`} x={mid + 1} y={HEIGHT - b.expenseH} width={BAR} height={b.expenseH} rx={4} fill={ROLES.note} />
              ) : null,
            ];
          })}
          {buckets.length > 1 ? (
            <Polyline points={line} fill="none" stroke={ROLES.accent} strokeWidth={2} strokeLinejoin="round" />
          ) : null}
        </Svg>
        <View style={{ flexDirection: 'row', height: HEIGHT }}>
          {buckets.map((b, i) => (
            <TouchableOpacity
              key={b.start}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === i }}
              accessibilityLabel={`${bucketLabel(b, period)}: received ${formatRupees(b.income_paise)}, spent ${formatRupees(b.expenses_paise)}`}
              onPress={() => onSelect(i)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {buckets.map((b, i) => (
          <Text
            key={b.start}
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: i === highlight || i === selected ? FONT.semibold : FONT.regular,
              fontSize: 11,
              color: i === highlight || i === selected ? COLORS.text : COLORS.muted,
            }}>
            {bucketLabel(b, period)}
          </Text>
        ))}
      </View>
    </View>
  );
}
