import { useState } from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { COLORS, FONT, ROLES, SHAPE, TYPE } from '@/features/money/palette';
import { CashFlowChart } from '../charts/CashFlowChart';
import { bucketIndexOf, PERIODS, stripText } from '../charts/model';
import { useCashFlow } from '../hooks';
import { signed } from '../month/model';
import { useRupees } from '../privacy';
import type { CashFlowBucket, CashFlowPeriod } from '../types';
import { CardError, EmptyState, Eyebrow, Skeleton, TodayCard } from './parts';

/**
 * Block 6, "WHERE YOUR MONEY MOVES" (spec 4.6). Week, Month and 3 Months; the
 * week tab replaces the old weekly tracker. Transfers between the user's own
 * accounts are left out. Tapping a bar shows a strip with View, which opens that
 * day's (or range's) transactions.
 */
export function CashFlowCard({
  selected,
  today,
  onView,
}: {
  /** The date selected on Today: the chart is around it, and it is highlighted. */
  selected: string;
  today: string;
  onView: (bucket: CashFlowBucket) => void;
}) {
  const formatRupees = useRupees();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<CashFlowPeriod>('week');
  const [tapped, setTapped] = useState<{ key: string; index: number } | null>(null);
  const query = useCashFlow(period, selected, today);
  const flow = query.data;
  // The tapped bar belongs to one period and date; switching either clears it.
  const tappedIndex = tapped?.key === `${period}:${selected}` ? tapped.index : null;
  const chartWidth = width - SHAPE.sidePadding * 2 - SHAPE.cardPadding * 2 - 2;

  const tabs = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {PERIODS.map((p) => {
        const on = p.value === period;
        return (
          <TouchableOpacity
            key={p.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => setPeriod(p.value)}
            hitSlop={6}
            style={{
              minHeight: 32,
              paddingHorizontal: 10,
              borderRadius: 16,
              justifyContent: 'center',
              backgroundColor: on ? ROLES.accentSoft : 'transparent',
            }}>
            <Text style={{ fontFamily: on ? FONT.semibold : FONT.medium, fontSize: 12, color: on ? ROLES.accent : COLORS.muted }}>
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const body = () => {
    if (!flow) {
      return query.isError ? (
        <CardError message="Couldn't load your cash flow." onRetry={() => void query.refetch()} />
      ) : (
        <Skeleton lines={[{ width: '100%', height: 120 }, { width: '70%', height: 14 }]} />
      );
    }
    if (!flow.enough_data) {
      return <EmptyState text="Your money's movement shows up here after a few days of logging." />;
    }
    const highlight = bucketIndexOf(flow.buckets, selected);
    const strip = tappedIndex !== null ? flow.buckets[tappedIndex] : null;
    return (
      <>
        <CashFlowChart
          buckets={flow.buckets}
          period={period}
          width={chartWidth}
          selected={tappedIndex}
          highlight={highlight}
          onSelect={(index) => setTapped(tappedIndex === index ? null : { key: `${period}:${selected}`, index })}
        />
        {strip ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: ROLES.accentSoft,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}>
            <Text style={{ flex: 1, fontFamily: FONT.medium, fontSize: 12.5, color: COLORS.text }}>
              {stripText(strip, period, formatRupees)}
            </Text>
            {strip.count > 0 ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => onView(strip)} hitSlop={10}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>View</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Figure label="Received" value={formatRupees(flow.received_paise)} dot={ROLES.positive} />
          <Figure label="Spent" value={formatRupees(flow.spent_paise)} dot={ROLES.note} />
          <Figure label="Remaining" value={signed(flow.remaining_paise, formatRupees)} dot={ROLES.accent} />
        </View>
      </>
    );
  };

  return (
    <TodayCard title={<Eyebrow>WHERE YOUR MONEY MOVES</Eyebrow>}>
      {tabs}
      {body()}
    </TodayCard>
  );
}

function Figure({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.muted }}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...TYPE.rowAmount, fontSize: 14, color: COLORS.text }}>
        {value}
      </Text>
    </View>
  );
}
