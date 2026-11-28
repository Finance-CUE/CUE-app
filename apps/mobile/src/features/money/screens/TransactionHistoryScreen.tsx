import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, HEADING_FONT, FONT, useDashboardTheme } from '@/features/money/palette';
import { useAuthStore } from '@/features/auth/store';
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
  const theme = useDashboardTheme();
  const insets = useSafeAreaInsets();
  const formatRupees = useRupees();
  // ?search=1 focuses the field (Today's Search chip); ?account= starts filtered (account
  // screen); ?start=&end= opens a day or range (cash flow's View); ?category= and ?type= come
  // from the Expenses and Income screens.
  const params = useLocalSearchParams<{
    search?: string;
    account?: string;
    start?: string;
    end?: string;
    category?: string;
    type?: TypeFilter;
  }>();
  const { search, account } = params;
  const today = useToday();
  const todayISO = toISODate(today);
  const [range, setRange] = useState<Range>(params.category || params.type ? '90' : '30');
  const [span, setSpan] = useState<{ start: string; end: string } | null>(
    params.start && params.end ? { start: params.start, end: params.end } : null,
  );
  const [type, setType] = useState<TypeFilter>(params.type ?? 'all');
  const [accountId, setAccountId] = useState<string | null>(account ?? null);
  const [category, setCategory] = useState<string | null>(params.category ?? null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // 365 days back to today is 366 days inclusive: the server's maximum.
  const txns = useTransactions(span?.start ?? daysBefore(today, Number(range)), span?.end ?? todayISO);
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
          <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: theme.accentText }}>‹ Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 24, color: COLORS.text, fontFamily: HEADING_FONT }}>Transactions</Text>
      <TextInput
        accessibilityLabel="Search transactions"
        autoFocus={search === '1'}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, amount or note"
        placeholderTextColor={COLORS.muted}
        returnKeyType="search"
        style={{
          fontFamily: FONT.medium,
          height: 48,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.white,
          fontSize: 15,
          color: COLORS.text }}
      />
      {span ? (
        <ChipRow
          options={[{ value: 'span', label: `${spanLabel(span)}  ×` }]}
          value="span"
          onChange={() => setSpan(null)}
        />
      ) : (
        <ChipRow options={RANGES} value={range} onChange={setRange} />
      )}
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
              <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.text }}>
                {g.day === todayISO ? 'Today' : shortDay(g.day)}
              </Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
                {[g.spentPaise ? `${formatRupees(g.spentPaise)} spent` : null, g.receivedPaise ? `${formatRupees(g.receivedPaise)} in` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <View style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 }}>
              {g.items.map((t) => (
                <TxnRow key={t.id} txn={t} accounts={byId} onPress={() => flows.openTxn(t)} onLongPress={() => flows.fixCategory(t)} />
              ))}
            </View>
          </View>
        )}
      />
      {flows.elements}
    </View>
  );
}

/** "Thu 12 Nov", or "9 Nov – 15 Nov" for a range from the cash flow chart. */
function spanLabel(span: { start: string; end: string }): string {
  if (span.start === span.end) return shortDay(span.start);
  return `${shortDay(span.start).slice(4)} – ${shortDay(span.end).slice(4)}`;
}
