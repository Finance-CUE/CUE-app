import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';
import { WalletIcon } from '../components/icons';
import { useRupees } from '../privacy';
import type { Account, NetWorth } from '../types';
import { ACCOUNTS_SHOWN, accountAmount, accountGroups, kindLabel } from './model';
import { CardError, EmptyState, Skeleton, TodayCard } from './parts';

/**
 * Spec 4.5: each account separately, largest first with cash last (the server
 * sorts), then "Cards and loans". Up to four, more behind "View all (6)".
 * Reads the same query as the net worth card, so the two never disagree.
 */
export function AccountsCard({
  query,
  onAdd,
  onOpen,
}: {
  query: UseQueryResult<NetWorth>;
  onAdd: () => void;
  onOpen: (account: Account) => void;
}) {
  const theme = useArchetypeTheme();
  const [all, setAll] = useState(false);
  const accounts = query.data?.accounts;

  const viewAll =
    accounts && accounts.length > ACCOUNTS_SHOWN ? (
      <TouchableOpacity accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={10}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accentText }}>
          {all ? 'Show less' : `View all (${accounts.length})`}
        </Text>
      </TouchableOpacity>
    ) : null;

  if (!accounts) {
    return (
      <TodayCard title="Your accounts">
        {query.isError ? (
          <CardError message="Couldn't load your accounts." onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 34 }, { width: '100%', height: 34 }]} />
        )}
      </TodayCard>
    );
  }

  if (accounts.length === 0) {
    return (
      <TodayCard title="Your accounts">
        <EmptyState
          icon={<WalletIcon color={theme.accent} size={48} />}
          text="Add your bank accounts and cash to see them here."
          action="+ Add account"
          onAction={onAdd}
        />
      </TodayCard>
    );
  }

  const shown = all ? accounts : accounts.slice(0, ACCOUNTS_SHOWN);
  const { money, cardsAndLoans } = accountGroups(shown);
  return (
    <TodayCard title="Your accounts" right={viewAll}>
      <View>
        {money.map((a) => (
          <AccountRow key={a.id} account={a} onPress={() => onOpen(a)} />
        ))}
      </View>
      {cardsAndLoans.length > 0 ? (
        <View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 2 }}>Cards and loans</Text>
          {cardsAndLoans.map((a) => (
            <AccountRow key={a.id} account={a} onPress={() => onOpen(a)} />
          ))}
        </View>
      ) : null}
      <TouchableOpacity accessibilityRole="button" onPress={onAdd} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accentText }}>+ Add account</Text>
      </TouchableOpacity>
    </TodayCard>
  );
}

function AccountRow({ account, onPress }: { account: Account; onPress: () => void }) {
  const theme = useArchetypeTheme();
  const formatRupees = useRupees();
  const amount = accountAmount(account, formatRupees);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${kindLabel(account.kind)}, ${amount}`}
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View
        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accentText }}>
          {account.name.trim()[0]?.toUpperCase() ?? '₹'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{account.name}</Text>
        <Text style={{ fontSize: 11, color: COLORS.muted }}>{kindLabel(account.kind)}</Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{amount}</Text>
    </TouchableOpacity>
  );
}
