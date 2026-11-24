import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { CategoryIcon, ClockIcon, RupeeIcon, SwapIcon } from '../components/icons';
import { Card, EmptyCard, Fab, Row, SectionHeader } from '../components/ui';
import { categoryLabel } from '../categories';
import { daysUntil, formatDate, formatDateTime, toISODate, weekDays, weekStartBack } from '../dates';
import { useRupees } from '../privacy';
import { useDeleteSpend, useDeleteSubscription, useDueSubscriptions, useNetWorth, useSpends, useSubscriptions, useToday } from '../hooks';
import { AddAccountSheet } from '../sheets/AddAccountSheet';
import { EntryDetailSheet } from '../sheets/EntryDetailSheet';
import { KhataSheet } from '../sheets/KhataSheet';
import { LogSpendSheet } from '../sheets/LogSpendSheet';
import { SubscriptionPromptSheet } from '../sheets/SubscriptionPromptSheet';
import { SubscriptionSheet } from '../sheets/SubscriptionSheet';
import { UpdateBalanceSheet } from '../sheets/UpdateBalanceSheet';
import { AccountsCard } from '../today/AccountsCard';
import { helloLine, shortDay } from '../today/model';
import { NetWorthCard } from '../today/NetWorthCard';
import { PastDateBanner, TodayHeader } from '../today/TodayHeader';
import type { DueCycle, Spend } from '../types';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';

type SheetName = 'log' | 'khata' | 'sub' | 'addAccount' | 'balance' | null;
/** Scrolled this far, the header collapses to a 56px bar (spec 4.1). */
const COLLAPSE_AT = 150;
type Detail = { title: string; lines: string[]; onDelete: () => Promise<void>; onEdit?: () => void };

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BAR_MAX = 64;
const LOAD_ERROR = 'Could not load. Pull to refresh.';

function weekTitle(weeksBack: number, monday: Date): string {
  if (weeksBack === 0) return 'This week';
  if (weeksBack === 1) return 'Last week';
  return `Week of ${formatDate(toISODate(monday))}`;
}

function dueLabel(n: number): string {
  if (n <= 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

const cycleKey = (c: DueCycle) => `${c.subscription_id}:${c.month}`;

function Loading() {
  const theme = useArchetypeTheme();
  return <ActivityIndicator color={theme.accent} />;
}

export function TodayScreen() {
  // Masked while the eye toggle hides amounts.
  const formatRupees = useRupees();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useArchetypeTheme();
  const queryClient = useQueryClient();
  const fullName = useAuthStore((s) => s.user?.full_name)?.trim() ?? '';
  const [sheet, setSheet] = useState<SheetName>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Dismissing hides the cycles shown, for that day only. A cycle that comes due
  // later still prompts, and a dismissed one comes back tomorrow or on the next launch.
  const [dismissed, setDismissed] = useState<{ on: string; keys: string[] }>({ on: '', keys: [] });

  const now = useToday();
  const todayISO = toISODate(now);
  // 0 = this week; earlier weeks let people look back and log what they missed.
  const [weeksBack, setWeeksBack] = useState(0);
  const monday = weekStartBack(now, weeksBack);
  const days = weekDays(monday);
  const weekStart = toISODate(days[0]);
  const weekEnd = toISODate(days[6]);
  // null = the default day (today, or Sunday of a past week), so it follows midnight.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selected = selectedDay ?? (weeksBack === 0 ? todayISO : weekEnd);
  const [editing, setEditing] = useState<Spend | null>(null);
  const changeWeek = (next: number) => {
    setWeeksBack(next);
    setSelectedDay(null);
  };
  const backToToday = () => {
    setWeeksBack(0);
    setSelectedDay(null);
  };

  // Net worth, its breakdown and the accounts card all read this one query.
  const netWorth = useNetWorth(todayISO);
  const [balanceAccount, setBalanceAccount] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const accountsY = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y > COLLAPSE_AT;
    if (next !== collapsed) setCollapsed(next);
  };
  const spends = useSpends(weekStart, weekEnd);
  const subs = useSubscriptions(todayISO);
  const due = useDueSubscriptions(todayISO);
  const dismissedKeys = dismissed.on === todayISO ? dismissed.keys : [];
  const prompt = (due.data ?? []).filter((c) => !dismissedKeys.includes(cycleKey(c)));
  const delSpend = useDeleteSpend();
  const delSub = useDeleteSubscription();

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };

  const byDay = (iso: string) => (spends.data ?? []).filter((s) => s.spent_on === iso);
  const total = (iso: string) => byDay(iso).reduce((sum, s) => sum + s.amount_paise, 0);
  const totals = days.map((d) => total(toISODate(d)));
  const weekMax = Math.max(...totals, 0);
  const selIdx = Math.max(0, days.findIndex((d) => toISODate(d) === selected));
  const selCount = byDay(selected).length;
  const daySpends = byDay(selected);
  const isToday = selected === todayISO;
  const close = () => {
    setSheet(null);
    setEditing(null);
  };
  const spendDetail = (s: Spend): Detail => ({
    title: s.description,
    lines: [
      formatRupees(s.amount_paise),
      categoryLabel(s.category),
      formatDate(s.spent_on),
      `Logged ${formatDateTime(s.created_at)}`,
    ],
    onDelete: async () => {
      await delSpend.mutateAsync(s.id);
    },
    // Subscription payments are changed through the subscription, not here.
    onEdit:
      s.category === 'subscription'
        ? undefined
        : () => {
            setDetail(null);
            setEditing(s);
            setSheet('log');
          },
  });
  const active = (subs.data ?? []).filter((s) => s.active && s.next_billing_on);
  const upcoming = active.filter((s) => daysUntil(s.next_billing_on ?? '', now) <= 7);
  const later = active.filter((s) => !upcoming.includes(s));
  const stopped = (subs.data ?? []).filter((s) => !s.active);
  const subRow = (s: (typeof active)[number]) => {
    const label = s.active ? dueLabel(daysUntil(s.next_billing_on ?? '', now)) : 'Stopped';
    return (
      <Row
        key={s.id}
        title={s.name}
        subtitle={label}
        amount={formatRupees(s.amount_paise)}
        onPress={() =>
          setDetail({
            title: s.name,
            lines: [formatRupees(s.amount_paise), `Billed on day ${s.billing_day} each month`, label],
            onDelete: async () => {
              await delSub.mutateAsync(s.id);
            },
          })
        }
      />
    );
  };

  const tiles: { label: string; bg: string; icon: ReactNode; sheet: SheetName }[] = [
    { label: 'Cash', bg: theme.tint, icon: <RupeeIcon color={theme.accentText} />, sheet: 'log' },
    { label: 'Lend / Borrow', bg: COLORS.sageTint, icon: <SwapIcon color={COLORS.sage} />, sheet: 'khata' },
    { label: 'Subscription', bg: COLORS.peachTint, icon: <ClockIcon color={COLORS.peach} />, sheet: 'sub' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 120, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} colors={[theme.accent]} />}>
        <TodayHeader
          today={now}
          selected={selected}
          weeksBack={weeksBack}
          onSelect={setSelectedDay}
          onWeeksBack={changeWeek}
        />
        {theme.slug ? (
          <Text style={{ marginTop: -6, fontSize: 15, fontStyle: 'italic', color: theme.accentText, fontFamily: HEADING_FONT }}>
            {theme.question}
          </Text>
        ) : null}
        {isToday ? null : <PastDateBanner selected={selected} onBack={backToToday} />}

        <NetWorthCard
          query={netWorth}
          onBreakdown={() => router.push('/net-worth')}
          onUpdateBalance={() => {
            setBalanceAccount(null);
            setSheet('balance');
          }}
          onAccounts={() => scroll.current?.scrollTo({ y: accountsY.current - 12, animated: true })}
          onAddAccount={() => setSheet('addAccount')}
        />

        <View onLayout={(e) => (accountsY.current = e.nativeEvent.layout.y)}>
          <AccountsCard
            query={netWorth}
            onAdd={() => setSheet('addAccount')}
            onOpen={(a) => {
              setBalanceAccount(a.id);
              setSheet('balance');
            }}
          />
        </View>

        <View style={{ gap: 12 }}>
          <SectionHeader title="Quick add" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {tiles.map((t) => (
              <TouchableOpacity
                key={t.label}
                accessibilityRole="button"
                onPress={() => setSheet(t.sheet)}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  borderRadius: 16,
                  backgroundColor: COLORS.white,
                  borderWidth: 1,
                  borderColor: COLORS.cardBorder,
                }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: t.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {t.icon}
                </View>
                <Text style={{ fontSize: 12, color: COLORS.text, textAlign: 'center' }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <SectionHeader title={weekTitle(weeksBack, monday)} />
          <Card>
            {spends.isPending ? (
              <Loading />
            ) : spends.isError ? (
              <Text style={{ color: COLORS.muted, fontSize: 14 }}>{LOAD_ERROR}</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {days.map((d, i) => {
                    const iso = toISODate(d);
                    const isToday = iso === todayISO;
                    const future = iso > todayISO;
                    const h = totals[i] > 0 ? Math.max(8, (totals[i] / weekMax) * BAR_MAX) : 4;
                    return (
                      <TouchableOpacity
                        key={iso}
                        accessibilityRole="button"
                        accessibilityLabel={DAY[i]}
                        disabled={future}
                        onPress={() => setSelectedDay(iso)}
                        activeOpacity={0.7}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: BAR_MAX + 24 }}>
                        <View
                          style={{
                            width: 14,
                            height: h,
                            borderRadius: 7,
                            backgroundColor: totals[i] > 0 || isToday ? theme.accent : COLORS.track,
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            color: iso === selected ? COLORS.text : COLORS.muted,
                            fontWeight: isToday || iso === selected ? '700' : '400',
                          }}>
                          {DAY[i]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 12 }}>
                  {DAY[selIdx]} · {formatRupees(totals[selIdx])} {selCount ? `${selCount} logged` : 'Nothing logged'}
                </Text>
              </>
            )}
          </Card>
        </View>

        <View style={{ gap: 12 }}>
          <SectionHeader
            title={isToday ? 'Today' : formatDate(selected)}
            right={<Text style={{ fontSize: 14, color: COLORS.muted }}>{formatRupees(total(selected))} spent</Text>}
          />
          {spends.isPending ? (
            <Card>
              <Loading />
            </Card>
          ) : spends.isError ? (
            <EmptyCard text={LOAD_ERROR} />
          ) : daySpends.length === 0 ? (
            <EmptyCard text={isToday ? 'Nothing logged yet.' : 'Nothing logged on this day. Tap + to add a spend for it.'} />
          ) : (
            <Card style={{ paddingVertical: 6 }}>
              {daySpends.map((s) => (
                <Row
                  key={s.id}
                  left={<CategoryIcon category={s.category} color={theme.accentText} />}
                  title={s.description}
                  subtitle={categoryLabel(s.category)}
                  amount={formatRupees(s.amount_paise)}
                  onPress={() => setDetail(spendDetail(s))}
                />
              ))}
            </Card>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <SectionHeader title="Upcoming" />
          {subs.isPending ? (
            <Card>
              <Loading />
            </Card>
          ) : subs.isError ? (
            <EmptyCard text={LOAD_ERROR} />
          ) : upcoming.length === 0 ? (
            <EmptyCard text="Nothing due in the next 7 days." />
          ) : (
            <Card style={{ paddingVertical: 6 }}>{upcoming.map(subRow)}</Card>
          )}
        </View>

        {later.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionHeader title="Active subscriptions" />
            <Card style={{ paddingVertical: 6 }}>{later.map(subRow)}</Card>
          </View>
        ) : null}

        {stopped.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionHeader title="Stopped" />
            <Card style={{ paddingVertical: 6 }}>{stopped.map(subRow)}</Card>
          </View>
        ) : null}
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
          <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 17, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>{helloLine(fullName)}</Text>
            <Text style={{ fontSize: 13, color: COLORS.muted }}>{isToday ? 'Today' : shortDay(selected)}</Text>
          </View>
          {isToday ? null : (
            <View style={{ paddingBottom: 8 }}>
              <PastDateBanner selected={selected} onBack={backToToday} />
            </View>
          )}
        </View>
      ) : null}

      <Fab onPress={() => setSheet('log')} />

      <LogSpendSheet visible={sheet === 'log'} onClose={close} editing={editing} defaultDate={selected} />
      <KhataSheet visible={sheet === 'khata'} onClose={close} />
      <SubscriptionSheet visible={sheet === 'sub'} onClose={close} />
      <SubscriptionPromptSheet
        // iOS may not present two RN Modals at once, so the prompt waits for the others.
        due={sheet || detail ? [] : prompt}
        currentMonth={`${todayISO.slice(0, 8)}01`}
        onClose={() => setDismissed({ on: todayISO, keys: [...dismissedKeys, ...prompt.map(cycleKey)] })}
      />
      <AddAccountSheet visible={sheet === 'addAccount'} onClose={close} />
      <UpdateBalanceSheet
        visible={sheet === 'balance'}
        onClose={close}
        accounts={netWorth.data?.accounts ?? []}
        initialAccountId={balanceAccount}
        onAddExpense={() => setSheet('log')}
      />
      <EntryDetailSheet
        visible={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ''}
        lines={detail?.lines ?? []}
        onDelete={detail?.onDelete ?? (async () => {})}
        onEdit={detail?.onEdit}
      />
    </View>
  );
}
