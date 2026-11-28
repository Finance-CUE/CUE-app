import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT, ROLES, TYPE } from '@/features/money/palette';
import { toISODate } from '../dates';
import { useMonth, useMonths, useToday } from '../hooks';
import { overspendLine, rateLabel, savingsTrendSentence, shortMonth, signed } from '../month/model';
import { DetailScreen, FigureRow, Headline, MonthBars, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { CardError, Skeleton, TodayCard } from '../today/parts';

export function SavingsScreen() {
  return (
    <SignedIn>
      <SavingsBody />
    </SignedIn>
  );
}

/**
 * Savings (spec 4.4): income − consumption expenses; the savings rate; a
 * six-month trend of savings and savings rate. Negative savings use plain
 * wording, never a warning colour.
 */
function SavingsBody() {
  const formatRupees = useRupees();
  const queryClient = useQueryClient();
  const todayISO = toISODate(useToday());
  const month = useMonth(todayISO);
  const months = useMonths(todayISO);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };
  const m = month.data;

  return (
    <DetailScreen title="Savings" refreshing={refreshing} onRefresh={refresh}>
      {!m ? (
        month.isError ? (
          <CardError message="Couldn't load your savings." onRetry={() => void month.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '50%', height: 40 }, { width: '70%', height: 14 }]} />
        )
      ) : (
        <>
          <Headline
            label="THIS MONTH"
            amount={signed(m.savings_paise, formatRupees)}
            sub={
              overspendLine(m, formatRupees) ??
              (m.savings_rate === null ? 'Add income to see your savings rate' : `${m.savings_rate}% of income saved`)
            }
          />
          <TodayCard>
            <FigureRow label="Income" value={formatRupees(m.income_paise)} />
            <FigureRow label="Expenses" value={`−${formatRupees(m.expenses_paise)}`} />
            <View style={{ height: 1, backgroundColor: COLORS.cardBorder }} />
            <FigureRow label="Savings" value={signed(m.savings_paise, formatRupees)} />
            <FigureRow label="Savings rate" value={rateLabel(m.savings_rate)} />
          </TodayCard>
        </>
      )}

      <TodayCard title="Last six months">
        {months.data ? (
          <View accessible accessibilityLabel={savingsTrendSentence(months.data, formatRupees)} style={{ gap: 10 }}>
            <MonthBars
              label="Savings"
              color={ROLES.accent}
              points={months.data.map((p) => ({
                month: p.month,
                value: Math.max(p.savings_paise, 0),
                text: signed(p.savings_paise, formatRupees),
              }))}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {months.data.map((p) => (
                <Text key={p.month} style={{ flex: 1, textAlign: 'center', ...TYPE.meta, color: COLORS.text }}>
                  {rateLabel(p.savings_rate)}
                </Text>
              ))}
            </View>
            <View style={{ gap: 2 }}>
              {months.data
                .slice()
                .reverse()
                .map((p) => (
                  <FigureRow
                    key={p.month}
                    label={`${shortMonth(p.month)} · ${rateLabel(p.savings_rate)}`}
                    value={signed(p.savings_paise, formatRupees)}
                  />
                ))}
            </View>
          </View>
        ) : months.isError ? (
          <CardError message="Couldn't load the last six months." onRetry={() => void months.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 110 }]} />
        )}
      </TodayCard>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        Savings = income − expenses. Savings rate = savings ÷ income. Goal Jar moves never count as spending or income.
      </Text>
    </DetailScreen>
  );
}
