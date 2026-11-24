import { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';
import { RupeeIcon } from '../components/icons';
import { useTransactions } from '../hooks';
import { shortDay } from '../today/model';
import { CardError, EmptyState, Eyebrow, Skeleton, TodayCard } from '../today/parts';
import type { Account, LedgerTxn } from '../types';
import { latestForDay } from './model';
import { TxnRow } from './TxnRow';

/**
 * Spec 4.9: "TODAY" (or the selected date) with View all, and that day's
 * latest five entries, newest first. Reads the ledger, so income, transfers
 * and Khata show here as well as spending.
 */
export function TodayTransactions({
  day,
  isToday,
  accounts,
  onOpen,
  onAdd,
  onViewAll,
}: {
  day: string;
  isToday: boolean;
  accounts: Account[];
  onOpen: (t: LedgerTxn) => void;
  onAdd: () => void;
  onViewAll: () => void;
}) {
  const theme = useArchetypeTheme();
  const query = useTransactions(day, day);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const rows = query.data ? latestForDay(query.data, day) : null;

  const title = <Eyebrow>{isToday ? 'TODAY' : shortDay(day).toUpperCase()}</Eyebrow>;
  const viewAll = (
    <TouchableOpacity accessibilityRole="button" onPress={onViewAll} hitSlop={10}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accentText }}>View all</Text>
    </TouchableOpacity>
  );

  return (
    <TodayCard title={title} right={viewAll}>
      {rows === null ? (
        query.isError ? (
          <CardError message="Couldn't load your transactions." onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 36 }, { width: '100%', height: 36 }]} />
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<RupeeIcon color={theme.accent} size={48} />}
          text={isToday ? 'Your financial story starts here. Add your first transaction.' : `Nothing logged on ${shortDay(day)}.`}
          action={isToday ? 'Add a transaction' : 'Add for this date'}
          onAction={onAdd}
        />
      ) : (
        <View>
          {rows.map((t) => (
            <TxnRow key={t.id} txn={t} accounts={byId} onPress={() => onOpen(t)} />
          ))}
        </View>
      )}
    </TodayCard>
  );
}
