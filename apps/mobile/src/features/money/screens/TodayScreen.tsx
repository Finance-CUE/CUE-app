import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { CategoryIcon, ClockIcon, RupeeIcon, SwapIcon } from '../components/icons';
import { Card, EmptyCard, Fab, Row, ScreenHeader, SectionHeader, useProfileAvatar } from '../components/ui';
import { categoryLabel } from '../categories';
import { daysUntil, formatDate, formatDateTime, greeting, startOfWeek, toISODate, weekDays } from '../dates';
import { formatRupees } from '../format';
import { useDeleteSpend, useDeleteSubscription, useDueSubscriptions, useSpends, useSubscriptions, useSummary, useToday } from '../hooks';
import { EntryDetailSheet } from '../sheets/EntryDetailSheet';
import { KhataSheet } from '../sheets/KhataSheet';
import { LogSpendSheet } from '../sheets/LogSpendSheet';
import { StartingMoneySheet } from '../sheets/StartingMoneySheet';
import { SubscriptionPromptSheet } from '../sheets/SubscriptionPromptSheet';
import { SubscriptionSheet } from '../sheets/SubscriptionSheet';
import type { DueCycle } from '../types';

type SheetName = 'log' | 'khata' | 'sub' | 'start' | null;
type Detail = { title: string; lines: string[]; onDelete: () => Promise<void> };

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BAR_MAX = 64;
const LOAD_ERROR = 'Could not load. Pull to refresh.';

function dueLabel(n: number): string {
  if (n <= 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

const cycleKey = (c: DueCycle) => `${c.subscription_id}:${c.month}`;

const Loading = () => <ActivityIndicator color={COLORS.purple} />;

export function TodayScreen() {
  const insets = useSafeAreaInsets();
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
  const days = weekDays(now);
  const weekStart = toISODate(startOfWeek(now));
  const weekEnd = toISODate(days[6]);
  // null = today, so the selection follows midnight.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selected = selectedDay ?? todayISO;

  const summary = useSummary();
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

  const first = fullName.split(/\s+/)[0];
  const avatar = useProfileAvatar();
  const byDay = (iso: string) => (spends.data ?? []).filter((s) => s.spent_on === iso);
  const total = (iso: string) => byDay(iso).reduce((sum, s) => sum + s.amount_paise, 0);
  const totals = days.map((d) => total(toISODate(d)));
  const weekMax = Math.max(...totals, 0);
  const selIdx = Math.max(0, days.findIndex((d) => toISODate(d) === selected));
  const selCount = byDay(selected).length;
  const todaySpends = byDay(todayISO);
  const close = () => setSheet(null);
  const nw = summary.data?.net_worth_paise ?? null;
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
    { label: 'Cash', bg: COLORS.purpleSoft, icon: <RupeeIcon color={COLORS.purple} />, sheet: 'log' },
    { label: 'Lend / Borrow', bg: COLORS.sageTint, icon: <SwapIcon color={COLORS.sage} />, sheet: 'khata' },
    { label: 'Subscription', bg: COLORS.peachTint, icon: <ClockIcon color={COLORS.peach} />, sheet: 'sub' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 120, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ScreenHeader
          eyebrow={greeting(new Date()) /* needs the hour; useToday only tracks the day */}
          title={first ? `Hi, ${first}` : 'Hi there'}
          {...avatar}
        />

        <View style={{ backgroundColor: COLORS.cardDark, borderRadius: 22, padding: 20, gap: 10 }}>
          {summary.isPending ? (
            <ActivityIndicator color={COLORS.linkOnDark} />
          ) : summary.isError ? (
            <Text style={{ color: COLORS.cardDarkText, fontSize: 14 }}>{LOAD_ERROR}</Text>
          ) : (
            <>
              {nw === null ? null : (
                <Text style={{ fontSize: 11, letterSpacing: 1.5, color: COLORS.cardDarkText }}>TOTAL NET WORTH</Text>
              )}
              <Text style={{ fontSize: 24, color: COLORS.white, fontFamily: HEADING_FONT }}>
                {nw === null ? 'Add your first financial details to see your full picture.' : formatRupees(nw)}
              </Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setSheet('start')} activeOpacity={0.7}>
                <Text style={{ color: COLORS.linkOnDark, fontSize: 14, fontWeight: '600' }}>
                  Update balance
                </Text>
              </TouchableOpacity>
            </>
          )}
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
          <SectionHeader title="This week" />
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
                    const h = totals[i] > 0 ? Math.max(8, (totals[i] / weekMax) * BAR_MAX) : 4;
                    return (
                      <TouchableOpacity
                        key={iso}
                        accessibilityRole="button"
                        accessibilityLabel={DAY[i]}
                        onPress={() => setSelectedDay(iso)}
                        activeOpacity={0.7}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: BAR_MAX + 24 }}>
                        <View
                          style={{
                            width: 14,
                            height: h,
                            borderRadius: 7,
                            backgroundColor: totals[i] > 0 || isToday ? COLORS.purple : COLORS.track,
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
            title="Today"
            right={<Text style={{ fontSize: 14, color: COLORS.muted }}>{formatRupees(total(todayISO))} spent</Text>}
          />
          {spends.isPending ? (
            <Card>
              <Loading />
            </Card>
          ) : spends.isError ? (
            <EmptyCard text={LOAD_ERROR} />
          ) : todaySpends.length === 0 ? (
            <EmptyCard text="Nothing logged yet." />
          ) : (
            <Card style={{ paddingVertical: 6 }}>
              {todaySpends.map((s) => (
                <Row
                  key={s.id}
                  left={<CategoryIcon category={s.category} color={COLORS.purple} />}
                  title={s.description}
                  subtitle={categoryLabel(s.category)}
                  amount={formatRupees(s.amount_paise)}
                  onPress={() =>
                    setDetail({
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
                    })
                  }
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

      <Fab onPress={() => setSheet('log')} />

      <LogSpendSheet visible={sheet === 'log'} onClose={close} />
      <KhataSheet visible={sheet === 'khata'} onClose={close} />
      <SubscriptionSheet visible={sheet === 'sub'} onClose={close} />
      <SubscriptionPromptSheet
        // iOS may not present two RN Modals at once, so the prompt waits for the others.
        due={sheet || detail ? [] : prompt}
        currentMonth={`${todayISO.slice(0, 8)}01`}
        onClose={() => setDismissed({ on: todayISO, keys: [...dismissedKeys, ...prompt.map(cycleKey)] })}
      />
      <StartingMoneySheet visible={sheet === 'start'} onClose={close} initial={summary.data?.starting_money ?? null} />
      <EntryDetailSheet
        visible={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ''}
        lines={detail?.lines ?? []}
        onDelete={detail?.onDelete ?? (async () => {})}
      />
    </View>
  );
}
