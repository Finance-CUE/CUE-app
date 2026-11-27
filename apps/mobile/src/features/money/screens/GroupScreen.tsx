import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES, TYPE } from '@/features/money/palette';
import { toErrorMessage } from '@/lib/api';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { formatDate, toISODate } from '../dates';
import { expenseMeta, memberLine, myBalanceLine, nameIn, stepLine } from '../groups/model';
import { useSharedFlows } from '../groups/useSharedFlows';
import { useArchiveGroup, useGroup, useNetWorth, useToday } from '../hooks';
import { DetailScreen, Headline, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { CardError, EmptyState, GhostChip, Skeleton, TodayCard } from '../today/parts';

export function GroupScreen({ id }: { id: string }) {
  return (
    <SignedIn>
      <GroupBody id={id} />
    </SignedIn>
  );
}

/**
 * One group (spec P3): your balance, everyone's balance, who pays whom to settle
 * up, expenses and settlements. Add expense, Settle up, Edit group, Archive.
 * Opened with ?expense=<id> from a transaction row, it opens that expense's editor.
 */
function GroupBody({ id }: { id: string }) {
  const formatRupees = useRupees();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { expense: expenseParam } = useLocalSearchParams<{ expense?: string }>();
  const todayISO = toISODate(useToday());
  const detail = useGroup(id);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const flows = useSharedFlows({ accounts });
  const archive = useArchiveGroup();
  const [refreshing, setRefreshing] = useState(false);
  const openedParam = useRef(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };

  const d = detail.data;
  // A transaction row's "edit this group expense".
  useEffect(() => {
    if (!d || !expenseParam || openedParam.current) return;
    const e = d.expenses.find((x) => x.id === expenseParam);
    if (e) {
      openedParam.current = true;
      flows.openGroupExpense(id, e);
    }
  }, [d, expenseParam, flows, id]);

  if (!d) {
    return (
      <DetailScreen title="Group">
        {detail.isError ? (
          <CardError message="Couldn't load this group." onRetry={() => void detail.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '60%', height: 40 }, { width: '100%', height: 120 }]} />
        )}
      </DetailScreen>
    );
  }

  const me = d.members.find((m) => m.is_me);
  const confirmArchive = () =>
    Alert.alert(`Archive ${d.group.name}?`, 'It leaves your groups. Its history stays in Transactions.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archive.mutateAsync(d.group.id);
            router.back();
          } catch (err) {
            Alert.alert("Couldn't archive", toErrorMessage(err, 'Please try again.'));
          }
        },
      },
    ]);

  return (
    <DetailScreen title={`${d.group.icon} ${d.group.name}`} refreshing={refreshing} onRefresh={refresh} overlay={flows.elements}>
      <Headline
        label="YOUR BALANCE"
        amount={formatRupees(Math.abs(d.group.my_balance_paise))}
        sub={myBalanceLine(d.group.my_balance_paise, formatRupees)}
      />
      <PrimaryButton label="Add expense" onPress={() => flows.openGroupExpense(d.group.id)} />
      <SecondaryButton label="Settle up" onPress={() => flows.openSettlement({ kind: 'group', groupId: d.group.id })} />

      <TodayCard title="Balances">
        {d.members
          .filter((m) => !m.removed || m.balance_paise !== 0)
          .map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
              <Text style={{ fontFamily: m.is_me ? FONT.semibold : FONT.medium, fontSize: 14, color: COLORS.text }}>{m.is_me ? 'You' : m.name}</Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>{memberLine(m, formatRupees)}</Text>
            </View>
          ))}
      </TodayCard>

      {d.settle_up.length ? (
        <TodayCard title="To settle up">
          {d.settle_up.map((s) => (
            <TouchableOpacity
              key={`${s.from_member}:${s.to_member}`}
              accessibilityRole="button"
              accessibilityHint="Records this settlement"
              onPress={() => flows.openSettlement({ kind: 'group', groupId: d.group.id, from: s.from_member, to: s.to_member, amountPaise: s.amount_paise })}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text, flex: 1 }}>{stepLine(d, s, formatRupees)}</Text>
              <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>Record ›</Text>
            </TouchableOpacity>
          ))}
        </TodayCard>
      ) : null}

      <TodayCard title="Expenses">
        {d.expenses.length === 0 ? (
          <EmptyState text="Nothing shared yet." action="Add expense" onAction={() => flows.openGroupExpense(d.group.id)} />
        ) : (
          d.expenses.map((e) => (
            <TouchableOpacity
              key={e.id}
              accessibilityRole="button"
              onPress={() => flows.openGroupExpense(d.group.id, e)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: COLORS.text }}>{e.description}</Text>
                <Text style={{ ...TYPE.meta, color: COLORS.muted }}>
                  {formatDate(e.occurred_on)} · {expenseMeta(d, e.paid_by, e.split, Object.keys(e.shares).length)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...TYPE.rowAmount, color: COLORS.text }}>{formatRupees(e.amount_paise)}</Text>
                <Text style={{ ...TYPE.meta, color: COLORS.muted }}>
                  {e.my_share_paise ? `Your share ${formatRupees(e.my_share_paise)}` : 'Not your share'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </TodayCard>

      {d.settlements.length ? (
        <TodayCard title="Settlements">
          {d.settlements.map((s) => (
            <TouchableOpacity
              key={s.id}
              accessibilityRole="button"
              accessibilityHint="Offers to delete this settlement"
              onPress={() =>
                Alert.alert('Delete this settlement?', `${stepLine(d, s, formatRupees)} on ${formatDate(s.occurred_on)}.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void flows.deleteSettlement(s.id) },
                ])
              }
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
              <View>
                <Text style={{ fontFamily: FONT.medium, fontSize: 13.5, color: COLORS.text }}>
                  {nameIn(d, s.from_member)} paid {nameIn(d, s.to_member) === 'You' ? 'you' : nameIn(d, s.to_member)}
                </Text>
                <Text style={{ ...TYPE.meta, color: COLORS.muted }}>{formatDate(s.occurred_on)}</Text>
              </View>
              <Text style={{ ...TYPE.rowAmount, color: COLORS.text }}>{formatRupees(s.amount_paise)}</Text>
            </TouchableOpacity>
          ))}
        </TodayCard>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <GhostChip label="Edit group" onPress={() => flows.openGroupForm(d)} />
        <GhostChip label="Archive" onPress={confirmArchive} />
      </View>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        Only your share of each expense counts as your spending. {me ? myBalanceLine(me.balance_paise, formatRupees) : ''} in this group,
        counted in your net worth apart from personal Khata.
      </Text>
    </DetailScreen>
  );
}
