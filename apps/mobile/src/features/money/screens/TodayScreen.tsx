import { useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/features/auth/store';
import { COLORS, FONT, HEADING_FONT, SHAPE, useDashboardTheme } from '@/features/money/palette';
import { PlusIcon, RupeeIcon, SwapIcon } from '../components/icons';
import { Fab } from '../components/ui';
import { toISODate, weekDays, weekStartBack } from '../dates';
import { useDues, useJars, useMonth, useNetWorth, useNetWorthHistory, useToday } from '../hooks';
import { useJarFlows } from '../jars/useJarFlows';
import { leftToSpendLine } from '../month/model';
import { useRupees } from '../privacy';
import { useDueFlows } from '../scheduled/useDueFlows';
import { AddAccountSheet } from '../sheets/AddAccountSheet';
import { KhataSheet } from '../sheets/KhataSheet';
import { AccountsCard } from '../today/AccountsCard';
import { CashFlowCard } from '../today/CashFlowCard';
import { GoalJarsCard } from '../today/GoalJarsCard';
import { ComingUpCard } from '../today/ComingUpCard';
import { helloLine, shortDay } from '../today/model';
import { NetWorthCard } from '../today/NetWorthCard';
import { NoteCard } from '../today/NoteCard';
import { ThisMonthCard } from '../today/ThisMonthCard';
import { MAX_WEEKS_AHEAD, PastDateBanner, TodayHeader } from '../today/TodayHeader';
import { TodayTransactions } from '../transactions/TodayTransactions';
import { useTxnFlows } from '../transactions/useTxnFlows';

type SheetName = 'khata' | 'addAccount' | null;
/** Scrolled this far, the header collapses to a 56px bar (spec 4.1). */
const COLLAPSE_AT = 150;
/** Overdue dues are looked for this far back; Coming up looks 30 days ahead (spec 4.8). */
const OVERDUE_DAYS = 90;

const plusDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
};

/**
 * Today (spec section 3): one scroll of blocks in the blueprint's order.
 *  1 Header and date strip · 2 Net worth (with the shortcut row) · 3 This month
 *  4 A note from CUE · 5 Your accounts · 6 Where your money moves
 *  7 My Goal Jars · 8 Coming up · 9 Today's transactions
 * The selected date changes daily activity only; balances always show today.
 */
export function TodayScreen() {
  const formatRupees = useRupees();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useDashboardTheme();
  const queryClient = useQueryClient();
  const fullName = useAuthStore((s) => s.user?.full_name)?.trim() ?? '';
  const [sheet, setSheet] = useState<SheetName>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = useToday();
  const todayISO = toISODate(now);
  // 0 = this week; positive = weeks back, negative = weeks ahead (future dates show dues).
  const [weeksBack, setWeeksBack] = useState(0);
  const monday = weekStartBack(now, weeksBack);
  const days = weekDays(monday);
  // null = the default day (today, Sunday of a past week, Monday of a future one), so it follows midnight.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selected = selectedDay ?? (weeksBack === 0 ? todayISO : toISODate(days[weeksBack > 0 ? 6 : 0]));
  const changeWeek = (next: number) => {
    setWeeksBack(next);
    setSelectedDay(null);
  };
  const backToToday = () => {
    setWeeksBack(0);
    setSelectedDay(null);
  };
  const isToday = selected === todayISO;
  const isFuture = selected > todayISO;

  // Net worth, its breakdown and the accounts card all read this one query.
  const netWorth = useNetWorth(todayISO);
  const accounts = netWorth.data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const month = useMonth(todayISO);
  const spark = useNetWorthHistory(todayISO, 30);
  const dues = useDues(plusDays(todayISO, -OVERDUE_DAYS), plusDays(todayISO, 7 * MAX_WEEKS_AHEAD + 7), true);
  const dueDates = useMemo(
    () => new Set((dues.data ?? []).filter((o) => o.status === 'due' && o.kind !== 'income').map((o) => o.due_on)),
    [dues.data],
  );

  const jars = useJars(todayISO);
  const jarFlows = useJarFlows({ accounts, jars: jars.data?.jars ?? [] });
  // The one-time "Reached" celebration, for a jar that hit its target since last time.
  const celebrated = useRef(new Set<string>());
  useEffect(() => {
    const reached = (jars.data?.jars ?? []).find((j) => j.state === 'complete' && !j.celebrated && !celebrated.current.has(j.id));
    if (reached) {
      celebrated.current.add(reached.id);
      jarFlows.celebrate(reached);
    }
  }, [jars.data, jarFlows]);
  const dueFlows = useDueFlows({ accounts });
  // Quick Add, a transaction's detail, Update balance and the Undo toast.
  const flows = useTxnFlows({
    accounts,
    defaultDate: selected,
    onLendBorrow: () => setSheet('khata'),
    onSubscription: () => dueFlows.openAdd(),
    onGoalJar: () => jarFlows.openMove('add'),
  });
  const openQuick = flows.openQuick;

  const scroll = useRef<ScrollView>(null);
  const accountsY = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y > COLLAPSE_AT;
    if (next !== collapsed) setCollapsed(next);
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };
  const close = () => setSheet(null);

  // Suggestion 20: the most common entries one tap from the top; the + stays for later.
  const shortcuts: { label: string; icon: ReactNode; onPress: () => void }[] = [
    { label: 'Expense', icon: <RupeeIcon color={theme.accentText} />, onPress: () => openQuick('expense') },
    { label: 'Income', icon: <RupeeIcon color={theme.accentText} />, onPress: () => openQuick('income') },
    { label: 'Transfer', icon: <SwapIcon color={theme.accentText} />, onPress: () => openQuick('transfer') },
    { label: 'More', icon: <PlusIcon color={theme.accentText} />, onPress: () => openQuick(null) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: SHAPE.sidePadding,
          // The FAB and the nav never cover the last card.
          paddingBottom: 120,
          gap: SHAPE.cardGap,
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} colors={[theme.accent]} />}>
        {/* 1. Header and date selector */}
        <TodayHeader
          today={now}
          selected={selected}
          weeksBack={weeksBack}
          onSelect={setSelectedDay}
          onWeeksBack={changeWeek}
          onSearch={() => router.push('/transactions?search=1')}
          dueDates={dueDates}
        />
        {isToday ? null : <PastDateBanner selected={selected} onBack={backToToday} />}

        {/* 2. Net worth */}
        <NetWorthCard
          query={netWorth}
          onBreakdown={() => router.push('/net-worth')}
          onUpdateBalance={() => flows.openBalance(null)}
          onAccounts={() => scroll.current?.scrollTo({ y: accountsY.current - 12, animated: true })}
          onAddAccount={() => setSheet('addAccount')}
          spark={spark.data?.points.map((p) => p.net_worth_paise)}
          onSpark={() => router.push('/net-worth?days=30' as Href)}
          leftToSpend={month.data ? leftToSpendLine(month.data, formatRupees) : null}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {shortcuts.map((t) => (
            <TouchableOpacity
              key={t.label}
              accessibilityRole="button"
              accessibilityLabel={t.label === 'More' ? 'More ways to log' : `Log ${t.label.toLowerCase()}`}
              onPress={t.onPress}
              activeOpacity={0.7}
              style={{ alignItems: 'center', gap: 6, minWidth: 64 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: theme.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {t.icon}
              </View>
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: COLORS.text }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 3. This month */}
        <View style={{ marginTop: 10 }}>
          <ThisMonthCard
            query={month}
            onOpen={(key) => router.push(`/${key === 'dues' ? 'dues' : key}` as Href)}
            onQuickAdd={(kind) => openQuick(kind)}
          />
        </View>

        {/* 4. A note from CUE (moved up, decided 16 Nov) */}
        <NoteCard />

        {/* 5. Your accounts */}
        <View onLayout={(e) => (accountsY.current = e.nativeEvent.layout.y)}>
          <AccountsCard
            query={netWorth}
            onAdd={() => setSheet('addAccount')}
            onOpen={(a) => router.push(`/account/${a.id}`)}
          />
        </View>

        {/* 6. Where your money moves */}
        <CashFlowCard
          selected={selected}
          today={todayISO}
          onView={(b) => router.push(`/transactions?start=${b.start}&end=${b.end}` as Href)}
        />

        {/* 7. My Goal Jars */}
        <GoalJarsCard
          query={jars}
          onOpen={(j) => router.push(`/jar/${j.id}` as Href)}
          onCreate={jarFlows.openCreate}
          onViewAll={() => router.push('/jars' as Href)}
        />

        {/* 8. Coming up */}
        <ComingUpCard
          query={dues}
          today={todayISO}
          selected={selected}
          accounts={byId}
          onOpen={dueFlows.openDetail}
          onPay={dueFlows.openPay}
          onSkip={dueFlows.skip}
          onCalendar={dueFlows.openCalendar}
          onAdd={() => dueFlows.openAdd()}
          onViewAll={() => router.push('/dues' as Href)}
        />

        {/* 9. Today's (or the selected day's) transactions; a future day has none. */}
        {isFuture ? null : (
          <TodayTransactions
            day={selected}
            isToday={isToday}
            accounts={accounts}
            onOpen={flows.openTxn}
            onAdd={() => openQuick(null)}
            onViewAll={() => router.push('/transactions')}
          />
        )}
      </ScrollView>

      {collapsed ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top,
            backgroundColor: COLORS.background,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.cardBorder,
          }}>
          <View
            style={{
              height: 56,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: SHAPE.sidePadding,
            }}>
            <Text style={{ fontSize: 17, color: COLORS.text, fontFamily: HEADING_FONT }}>{helloLine(fullName)}</Text>
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{isToday ? 'Today' : shortDay(selected)}</Text>
          </View>
          {isToday ? null : (
            <View style={{ paddingBottom: 8 }}>
              <PastDateBanner selected={selected} onBack={backToToday} />
            </View>
          )}
        </View>
      ) : null}

      <Fab onPress={() => openQuick(null)} accessibilityLabel="Log something" />
      <KhataSheet visible={sheet === 'khata'} onClose={close} />
      <AddAccountSheet visible={sheet === 'addAccount'} onClose={close} />
      {flows.elements}
      {dueFlows.elements}
      {jarFlows.elements}
    </View>
  );
}
