import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { toISODate } from '../dates';
import { useDues, useMonth, useNetWorth, useToday } from '../hooks';
import { monthEndLabel } from '../month/model';
import { DetailScreen, Headline, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { DueRow } from '../scheduled/DueRow';
import { groupByKind } from '../scheduled/model';
import { useDueFlows } from '../scheduled/useDueFlows';
import { CardError, EmptyState, GhostChip, LightButton, Skeleton, TodayCard } from '../today/parts';

const plusDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
};

export function DuesScreen() {
  return (
    <SignedIn>
      <DuesBody />
    </SignedIn>
  );
}

/**
 * Upcoming dues (spec 4.4, 4.8): subscriptions, bills, EMIs, rent and other
 * recurring payments, grouped by type, each with Mark paid. Dues are not
 * expenses until paid. Overdue ones ("Check") stay until answered.
 */
function DuesBody() {
  const formatRupees = useRupees();
  const queryClient = useQueryClient();
  const todayISO = toISODate(useToday());
  const month = useMonth(todayISO);
  const dues = useDues(plusDays(todayISO, -90), plusDays(todayISO, 60), true);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const flows = useDueFlows({ accounts });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };
  const open = (dues.data ?? []).filter((o) => o.status === 'due');
  const groups = groupByKind(open);
  const m = month.data;

  return (
    <DetailScreen title="Upcoming dues" refreshing={refreshing} onRefresh={refresh} overlay={flows.elements}>
      {m ? (
        <Headline
          label="DUE THIS MONTH"
          amount={formatRupees(m.dues_paise)}
          sub={m.dues_count === 0 ? 'Nothing more due this month' : `${m.dues_count} ${m.dues_count === 1 ? 'payment' : 'payments'} before ${monthEndLabel(m.month)}`}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <LightButton label="+ Add a subscription or bill" onPress={() => flows.openAdd()} />
        <GhostChip label="View calendar" onPress={flows.openCalendar} />
      </View>

      {!dues.data ? (
        dues.isError ? (
          <CardError message="Couldn't load your dues." onRetry={() => void dues.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 56 }, { width: '100%', height: 56 }]} />
        )
      ) : groups.length === 0 ? (
        <TodayCard>
          <EmptyState text="Nothing due in the next 60 days." action="Add a subscription or bill" onAction={() => flows.openAdd()} />
        </TodayCard>
      ) : (
        groups.map((g) => (
          <TodayCard key={g.kind} title={g.label} right={<Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.muted }}>{formatRupees(g.items.reduce((s, o) => s + o.amount_paise, 0))}</Text>}>
            <View>
              {g.items.map((o, i) => (
                <DueRow
                  key={`${o.schedule_id}:${o.due_on}`}
                  occurrence={o}
                  accounts={byId}
                  today={todayISO}
                  onOpen={() => flows.openDetail(o)}
                  onPay={() => flows.openPay(o)}
                  onSkip={() => flows.skip(o)}
                  last={i === g.items.length - 1}
                />
              ))}
            </View>
          </TodayCard>
        ))
      )}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        A due becomes an expense only when you mark it paid. A passed date never marks it paid by itself.
      </Text>
    </DetailScreen>
  );
}
