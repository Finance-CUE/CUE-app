import { useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { toISODate } from '../dates';
import { useMonth, useNetWorth, useToday, useTransactions } from '../hooks';
import { vsLastMonth } from '../month/model';
import { DetailScreen, HBar, Headline, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { categoryName } from '../quickAdd/model';
import { CardError, EmptyState, Skeleton, TodayCard } from '../today/parts';
import { newestFirst } from '../transactions/model';
import { TxnRow } from '../transactions/TxnRow';
import { useTxnFlows } from '../transactions/useTxnFlows';

export function ExpensesScreen() {
  return (
    <SignedIn>
      <ExpensesBody />
    </SignedIn>
  );
}

/**
 * Expenses (spec 4.4): total this month; category bars, largest first, each
 * opening a filtered history; daily average; comparison with the same days of
 * last month (suggestion 12); this month's expenses.
 */
function ExpensesBody() {
  const formatRupees = useRupees();
  const router = useRouter();
  const queryClient = useQueryClient();
  const todayISO = toISODate(useToday());
  const first = `${todayISO.slice(0, 7)}-01`;
  const month = useMonth(todayISO);
  const txns = useTransactions(first, todayISO);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const flows = useTxnFlows({ accounts, defaultDate: todayISO });
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
  const spends = newestFirst((txns.data ?? []).filter((t) => t.type === 'expense' || t.type === 'refund'));
  const largest = m?.categories[0]?.paise ?? 0;

  return (
    <DetailScreen title="Expenses" refreshing={refreshing} onRefresh={refresh} overlay={flows.elements}>
      {!m ? (
        month.isError ? (
          <CardError message="Couldn't load your expenses." onRetry={() => void month.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '50%', height: 40 }, { width: '70%', height: 14 }]} />
        )
      ) : (
        <>
          <Headline
            label="THIS MONTH"
            amount={formatRupees(m.expenses_paise)}
            sub={m.expenses_paise === 0 ? 'No spends yet' : `${formatRupees(m.daily_average_paise)} a day on average`}
          />
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text, marginTop: -6 }}>
            {vsLastMonth(m.expenses_paise, m.expenses_same_days_last_month_paise, formatRupees)}
          </Text>
          <TodayCard title="By category">
            {m.categories.length === 0 ? (
              <EmptyState text="Spending by category shows up once you log an expense." action="Add an expense" onAction={() => flows.openQuick('expense')} />
            ) : (
              m.categories.map((c) => (
                <HBar
                  key={c.category}
                  label={categoryName(c.category)}
                  value={formatRupees(c.paise)}
                  share={largest > 0 ? c.paise / largest : 0}
                  color={ROLES.note}
                  onPress={() => router.push(`/transactions?category=${c.category}&type=expense` as Href)}
                />
              ))
            )}
          </TodayCard>
        </>
      )}

      <TodayCard title="This month's expenses">
        {txns.isError ? (
          <CardError message="Couldn't load this month's expenses." onRetry={() => void txns.refetch()} />
        ) : spends.length === 0 ? (
          <EmptyState text="No spends yet this month." action="Add an expense" onAction={() => flows.openQuick('expense')} />
        ) : (
          <View>
            {spends.map((t) => (
              <TxnRow key={t.id} txn={t} accounts={byId} onPress={() => flows.openTxn(t)} />
            ))}
          </View>
        )}
      </TodayCard>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        Expenses are what you consumed: card spends count on the day of the swipe, refunds come off. Transfers, card bill
        payments, lending and repayments are not expenses.
      </Text>
    </DetailScreen>
  );
}
