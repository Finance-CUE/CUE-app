import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { useMonth, useMonths, useNetWorth, useScheduled, useToday, useTransactions } from '../hooks';
import { DetailScreen, FigureRow, Headline, MonthBars, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { frequencyLabel, nextLine, recurringIncome } from '../scheduled/model';
import { ScheduleSheet } from '../scheduled/ScheduleSheet';
import { toISODate } from '../dates';
import { CardError, EmptyState, LightButton, Skeleton, TodayCard } from '../today/parts';
import { newestFirst } from '../transactions/model';
import { TxnRow } from '../transactions/TxnRow';
import { useTxnFlows } from '../transactions/useTxnFlows';
import type { Schedule } from '../types';

export function IncomeScreen() {
  return (
    <SignedIn>
      <IncomeBody />
    </SignedIn>
  );
}

/**
 * Income (spec 4.4): total this month; salary; other income; recurring income
 * with its next expected date; six monthly bars; this month's income.
 */
function IncomeBody() {
  const formatRupees = useRupees();
  const queryClient = useQueryClient();
  const todayISO = toISODate(useToday());
  const first = `${todayISO.slice(0, 7)}-01`;
  const month = useMonth(todayISO);
  const months = useMonths(todayISO);
  const scheduled = useScheduled(todayISO);
  const txns = useTransactions(first, todayISO);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const flows = useTxnFlows({ accounts, defaultDate: todayISO });
  const [form, setForm] = useState<{ item: Schedule | null } | null>(null);
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
  const recurring = recurringIncome(scheduled.data ?? []);
  const income = newestFirst((txns.data ?? []).filter((t) => t.type === 'income'));

  return (
    <DetailScreen
      title="Income"
      refreshing={refreshing}
      onRefresh={refresh}
      overlay={
        <>
          <ScheduleSheet
            visible={form !== null}
            item={form?.item ?? null}
            income
            accounts={accounts}
            onClose={() => setForm(null)}
            onSaved={() => undefined}
          />
          {flows.elements}
        </>
      }>
      {!m ? (
        month.isError ? (
          <CardError message="Couldn't load your income." onRetry={() => void month.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '50%', height: 40 }, { width: '70%', height: 14 }]} />
        )
      ) : (
        <>
          <Headline
            label="THIS MONTH"
            amount={formatRupees(m.income_paise)}
            sub={m.income_paise === 0 ? 'Add income or set up salary' : null}
          />
          <TodayCard>
            <FigureRow label="Salary" value={formatRupees(m.salary_paise)} />
            <FigureRow label="Other income" value={formatRupees(m.other_income_paise)} />
          </TodayCard>
        </>
      )}

      <TodayCard title="Recurring income">
        {scheduled.isError ? (
          <CardError message="Couldn't load recurring income." onRetry={() => void scheduled.refetch()} />
        ) : recurring.length === 0 ? (
          <EmptyState
            text="Tell CUE when your salary arrives. It shows the free-to-spend line and asks you to confirm each payday."
            action="Set up salary"
            onAction={() => setForm({ item: null })}
          />
        ) : (
          <>
            {recurring.map((s) => (
              <FigureRow
                key={s.id}
                label={`${s.name} · ${frequencyLabel(s.frequency)} · ${nextLine(s)}`}
                value={formatRupees(s.amount_paise)}
                onPress={() => setForm({ item: s })}
              />
            ))}
            <View style={{ flexDirection: 'row' }}>
              <LightButton label="Add recurring income" onPress={() => setForm({ item: null })} />
            </View>
          </>
        )}
      </TodayCard>

      <TodayCard title="Month by month">
        {months.data ? (
          <MonthBars
            label="Income"
            color={ROLES.positive}
            points={months.data.map((p) => ({ month: p.month, value: p.income_paise, text: formatRupees(p.income_paise) }))}
          />
        ) : months.isError ? (
          <CardError message="Couldn't load the last six months." onRetry={() => void months.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 110 }]} />
        )}
      </TodayCard>

      <TodayCard title="This month's income">
        {txns.isError ? (
          <CardError message="Couldn't load this month's income." onRetry={() => void txns.refetch()} />
        ) : income.length === 0 ? (
          <EmptyState text="No income logged this month yet." action="Add income" onAction={() => flows.openQuick('income')} />
        ) : (
          <View>
            {income.map((t) => (
              <TxnRow key={t.id} txn={t} accounts={byId} onPress={() => flows.openTxn(t)} onLongPress={() => flows.fixCategory(t)} />
            ))}
          </View>
        )}
      </TodayCard>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        Refunds reduce your expenses instead of counting as income. Money moved between your own accounts is never income.
      </Text>

    </DetailScreen>
  );
}
