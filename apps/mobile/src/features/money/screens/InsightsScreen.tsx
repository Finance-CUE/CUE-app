import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { CategoryIcon } from '../components/icons';
import { Card, EmptyCard, Row, ScreenHeader, ScreenScroll, SectionHeader, useProfileAvatar } from '../components/ui';
import { categoryLabel } from '../categories';
import { monthRange, toISODate, weekDays } from '../dates';
import { formatRupees } from '../format';
import { useSpends } from '../hooks';
import type { Category } from '../types';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BAR_AREA = 96;

const Total = ({ paise }: { paise: number }) => (
  <Text style={{ fontSize: 13, color: COLORS.muted }}>{formatRupees(paise)} total</Text>
);

export function InsightsScreen() {
  const queryClient = useQueryClient();
  const avatar = useProfileAvatar();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };
  const today = new Date();
  const days = weekDays(today);
  const weekStart = toISODate(days[0]);
  const weekEnd = toISODate(days[6]);
  const month = monthRange(today);
  // Month and week overlap, so one query covers both (ISO strings compare lexically).
  const start = weekStart < month.start ? weekStart : month.start;
  const end = weekEnd > month.end ? weekEnd : month.end;
  const spends = useSpends(start, end);
  const all = spends.data ?? [];

  const dayTotals = days.map((d) => {
    const iso = toISODate(d);
    return all.filter((s) => s.spent_on === iso).reduce((sum, s) => sum + s.amount_paise, 0);
  });
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);
  const maxDay = Math.max(...dayTotals, 0);

  const byCategory = new Map<Category, number>();
  for (const s of all) {
    if (s.spent_on < month.start || s.spent_on > month.end) continue;
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + s.amount_paise);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ready = !spends.isLoading && !spends.isError;
  const eyebrow = `Week of ${days[0].getDate()} ${days[0].toLocaleString('en-GB', { month: 'short' })}`;

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader eyebrow={eyebrow} title="Insights" {...avatar} />

      <Card style={{ backgroundColor: COLORS.purpleSoft, borderColor: COLORS.purpleSoft, borderRadius: 22 }}>
        <Text style={{ fontSize: 14, color: COLORS.text }}>CUE will start noticing patterns as you use it.</Text>
      </Card>

      <SectionHeader title="Spend by day" right={ready ? <Total paise={weekTotal} /> : undefined} />
      <Card>
        {spends.isLoading ? (
          <ActivityIndicator color={COLORS.purple} />
        ) : spends.isError ? (
          <Text style={{ color: COLORS.muted, fontSize: 14 }}>Could not load. Pull to refresh.</Text>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {dayTotals.map((t, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={{ height: BAR_AREA, justifyContent: 'flex-end' }}>
                  <View
                    style={{
                      width: 18,
                      borderRadius: 9,
                      height: t > 0 && maxDay > 0 ? Math.max(4, (t / maxDay) * BAR_AREA) : 4,
                      backgroundColor: t > 0 ? COLORS.purple : COLORS.track,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 12, color: COLORS.muted }}>{DAY_LETTERS[i]}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <SectionHeader
        title="Where it went"
        right={ready && top.length ? <Text style={{ fontSize: 13, color: COLORS.muted }}>Top {top.length}</Text> : undefined}
      />
      {!ready ? null : top.length ? (
        <Card>
          {top.map(([slug, paise]) => (
            <Row
              key={slug}
              left={
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: COLORS.purpleSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <CategoryIcon category={slug} color={COLORS.text} size={20} />
                </View>
              }
              title={categoryLabel(slug)}
              subtitle="This month"
              amount={formatRupees(paise)}
            />
          ))}
        </Card>
      ) : (
        <EmptyCard text="Nothing logged this month yet." />
      )}
    </ScreenScroll>
  );
}
