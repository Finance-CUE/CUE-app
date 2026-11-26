import { useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { useRupees } from '../privacy';
import type { NetWorthHistory } from '../types';
import { linePath, nearestIndex, tooltipDay } from './model';

const HEIGHT = 160;

/**
 * The net worth line (spec 4.3): an accent line with a soft area fill. Drag along
 * it to see a date and its net worth; lifting the finger on a point opens
 * "Your position on" that day. Days before the user's first data aren't drawn.
 */
export function NetWorthChart({
  history,
  width,
  onPick,
}: {
  history: NetWorthHistory;
  width: number;
  onPick: (day: string) => void;
}) {
  const formatRupees = useRupees();
  const [active, setActive] = useState<number | null>(null);
  const points = history.points;
  const values = points.map((p) => p.net_worth_paise);
  const { line, area } = linePath(values, width, HEIGHT);
  const indexAt = (x: number) => nearestIndex(x, width, points.length);

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => points.length > 0,
    onMoveShouldSetPanResponder: () => points.length > 0,
    // Keep the drag when the finger wanders up or down: the page must not scroll mid-read.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => setActive(indexAt(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => setActive(indexAt(e.nativeEvent.locationX)),
    onPanResponderRelease: (e) => {
      const i = indexAt(e.nativeEvent.locationX);
      setActive(null);
      if (points[i]) onPick(points[i].on);
    },
    onPanResponderTerminate: () => setActive(null),
  });

  if (points.length === 0) return null;
  const x = (i: number) => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * width);
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const y = (v: number) => (range === 0 ? HEIGHT / 2 : 6 + (1 - (v - min) / range) * (HEIGHT - 12));
  const point = active !== null ? points[active] : null;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ minHeight: 34, justifyContent: 'flex-end' }}>
        {point ? (
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text }}>
            {tooltipDay(point.on)} · {formatRupees(point.net_worth_paise)}
          </Text>
        ) : (
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
            Drag along the line to see a day. Lift to open it.
          </Text>
        )}
      </View>
      <View
        {...responder.panHandlers}
        accessible
        accessibilityLabel={`Net worth chart from ${tooltipDay(points[0].on)} to ${tooltipDay(points[points.length - 1].on)}`}>
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ROLES.accent} stopOpacity={0.22} />
              <Stop offset="1" stopColor={ROLES.accent} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {points.length > 1 ? <Path d={area} fill="url(#nwFill)" /> : null}
          <Path d={line} fill="none" stroke={ROLES.accent} strokeWidth={2.5} strokeLinejoin="round" />
          {point && active !== null ? (
            <>
              <Line x1={x(active)} y1={0} x2={x(active)} y2={HEIGHT} stroke={ROLES.line} strokeWidth={1} />
              <Circle cx={x(active)} cy={y(point.net_worth_paise)} r={5} fill={ROLES.accent} stroke={COLORS.white} strokeWidth={2} />
            </>
          ) : null}
        </Svg>
      </View>
    </View>
  );
}
