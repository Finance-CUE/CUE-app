import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';
import { ChipRow } from '../components/ui';
import { daysBefore, toISODate } from '../dates';
import { useNetWorth, useToday, useTransactions } from '../hooks';
import { useRupees } from '../privacy';
import { categoryName } from '../quickAdd/model';
import { shortDay } from '../today/model';
import { CardError, EmptyState, Skeleton } from '../today/parts';
import { applyFilters, dayGroups, TYPE_FILTERS, type TypeFilter } from '../transactions/model';
import { TxnRow } from '../transactions/TxnRow';
import { useTxnFlows } from '../transactions/useTxnFlows';

type Range = '30' | '90' | '365';
const RANGES: { value: Range; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '3 months' },
  { value: '365', label: '1 year' },
];

export function TransactionHistoryScreen() {
  const status = useAuthStore((s) => s.status);
  if (status === 'restoring') return null;
  if (status !== 'authenticated') return <Redirect href="/" />;
  return <HistoryBody />;
}

/**
 * Spec 4.9 View all: day groups with day totals; filters for date, type,
 * account and category; search by description, amount or notes. "Search" in
 * Today's header opens this with the field focused.
 */
function HistoryBody() {
  const router = useRouter();
  const theme = useArchetypeTheme();
  const insets = useSafeAreaInsets();
  const formatRupees = useRupees();
  const { search } = useLocalSearchParams<{ search?: string }>();
  const today = useToday();
  const todayISO = toISODate(today);
  const [range, setRange] = useState<Range>('30');
  const [type, setType] = useState<TypeFilter>('all');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // 365 days back to today is 366 days inclusive: the server's maximum.
  const txns = useTransactions(daysBefore(today, Number(range)), todayISO);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const flows = useTxnFlows({ accounts, defaultDate: todayISO });

  const filtered = applyFilters(txns.data ?? [], { type, accountId, category, query });
  const groups = dayGroups(filtered);
  const categories = [...new Set((txns.data ?? []).map((t) => t.category).filter((c): c is string => Boolean(c)))];

  const refresh = async () => {
    setRefreshing(true);
    try {
      await txns.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: theme.accentText, fontWeight: '600' }}>‹ Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 24, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>Transactions</Text>
      <TextInput
        accessibilityLabel="Search transactions"
        autoFocus={search === '1'}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, amount or note"
        placeholderTextColor={COLORS.muted}
        returnKeyType="search"
        style={{
          height: 48,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.white,
          fontSize: 15,
          color: COLORS.text,
        }}
      />
      <ChipRow options={RANGES} value={range} onChange={setRange} />
      <ChipRow options={TYPE_FILTERS} value={type} onChange={setType} />
      {accounts.length > 1 ? (
        <ChipRow
          options={[{ value: '', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
          value={accountId ?? ''}
          onChange={(v) => setAccountId(v || null)}
        />
      ) : null}
      {categories.length > 1 ? (
        <ChipRow
          options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: categoryName(c) }))]}
          value={category ?? ''}
          onChange={(v) => setCategory(v || null)}
        />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={txns.data ? groups : []}
        keyExtractor={(g) => g.day}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 120, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} colors={[theme.accent]} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          txns.isError ? (
            <CardError message="Couldn't load your transactions." onRetry={() => void txns.refetch()} />
          ) : !txns.data ? (
            <Skeleton lines={[{ width: '100%', height: 40 }, { width: '100%', height: 40 }, { width: '100%', height: 40 }]} />
          ) : (
            <EmptyState text={query || type !== 'all' || accountId || category ? 'Nothing matches. Try another search or filter.' : 'Nothing logged in this period yet.'} />
          )
        }
        renderItem={({ item: g }) => (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>
                {g.day === todayISO ? 'Today' : shortDay(g.day)}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.muted }}>
                {[g.spentPaise ? `${formatRupees(g.spentPaise)} spent` : null, g.receivedPaise ? `${formatRupees(g.receivedPaise)} in` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <View style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 }}>
              {g.items.map((t) => (
                <TxnRow key={t.id} txn={t} accounts={byId} onPress={() => flows.openTxn(t)} />
              ))}
            </View>
          </View>
        )}
      />
      {flows.elements}
    </View>
  );
}
