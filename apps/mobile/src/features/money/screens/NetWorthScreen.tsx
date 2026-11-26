import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { COLORS, HEADING_FONT, FONT, useDashboardTheme } from '@/features/money/palette';
import { useAuthStore } from '@/features/auth/store';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { ScreenScroll } from '../components/ui';
import { NetWorthChart } from '../charts/NetWorthChart';
import { historyNote, RANGES, tooltipDay } from '../charts/model';
import { toISODate } from '../dates';
import { usePrivacyStore, useRupees } from '../privacy';
import { useNetWorth, useNetWorthHistory, usePosition, useToday } from '../hooks';
import { Sheet } from '../sheets/Sheet';
import { breakdown, changeLine, netWorthSentence } from '../today/model';
import { CardError, Eyebrow, Skeleton, TodayCard } from '../today/parts';
import type { Account } from '../types';

export function NetWorthScreen() {
  const status = useAuthStore((s) => s.status);
  if (status === 'restoring') return null;
  if (status !== 'authenticated') return <Redirect href="/" />;
  // Queries only run once signed in, so they live in the inner component.
  return <NetWorthBody />;
}

function NetWorthBody() {
  // Masked while the eye toggle hides amounts.
  const formatRupees = useRupees();
  const theme = useDashboardTheme();
  const router = useRouter();
  const hidden = usePrivacyStore((st) => st.hidden);
  const toggle = usePrivacyStore((st) => st.toggle);
  const todayISO = toISODate(useToday());
  const { width } = useWindowDimensions();
  // ?days=30 from the card's sparkline; 30D is the default anyway.
  const params = useLocalSearchParams<{ days?: string }>();
  const [days, setDays] = useState(() => RANGES.find((r) => String(r.days) === params.days)?.days ?? 30);
  const [positionOn, setPositionOn] = useState<string | null>(null);
  const netWorth = useNetWorth(todayISO);
  const history = useNetWorthHistory(todayISO, days);
  const position = usePosition(positionOn);

  const nw = netWorth.data;
  const note = history.data ? historyNote(history.data, days, todayISO) : null;
  const change = nw ? changeLine(nw.change_this_month_paise, formatRupees) : null;
  const table = nw ? breakdown(nw, nw.accounts) : null;
  // "Tap opens" (spec 4.3): Khata for money lent or borrowed; the account
  // itself when there is exactly one of that kind. Other rows don't respond yet.
  const only = (pick: (a: Account) => boolean) => {
    const found = (nw?.accounts ?? []).filter(pick);
    return found.length === 1 ? () => router.push(`/account/${found[0].id}`) : undefined;
  };
  const opens = (label: string): (() => void) | undefined => {
    if (label === 'Money lent' || label === 'Money borrowed') return () => router.push('/khata');
    if (label === 'Bank accounts') return only((a) => a.kind === 'savings' || a.kind === 'current');
    if (label === 'Cash') return only((a) => a.kind === 'cash');
    if (label === 'Credit card outstanding') return only((a) => a.kind === 'credit_card');
    return undefined;
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: theme.accentText }}>‹ Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
              onPress={toggle}
              hitSlop={12}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              {hidden ? <EyeOffIcon color={theme.accentText} size={20} /> : <EyeIcon color={theme.accentText} size={20} />}
            </TouchableOpacity>
          </View>
          <View accessible accessibilityLabel={nw ? netWorthSentence(nw, formatRupees) : 'Net worth'}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.muted }}>Net worth</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 40, color: COLORS.text, fontFamily: HEADING_FONT }}>
              {nw ? formatRupees(nw.net_worth_paise) : '—'}
            </Text>
            {change ? <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>{change.text}</Text> : null}
          </View>

          <TodayCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {RANGES.map((r) => {
                const on = r.days === days;
                return (
                  <TouchableOpacity
                    key={r.label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setDays(r.days)}
                    style={{
                      minWidth: 48,
                      minHeight: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? theme.tint : 'transparent',
                    }}>
                    <Text style={{ fontFamily: on ? FONT.semibold : FONT.medium, fontSize: 13, color: on ? theme.accentText : COLORS.muted }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {history.data ? (
              history.data.points.length === 0 ? (
                <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>
                  Add an account to see how your net worth moves over time.
                </Text>
              ) : (
                <NetWorthChart history={history.data} width={width - 26 * 2 - 20 * 2 - 2} onPick={setPositionOn} />
              )
            ) : history.isError ? (
              <CardError message="Couldn't load the chart." onRetry={() => void history.refetch()} />
            ) : (
              <Skeleton lines={[{ width: '100%', height: 160 }]} />
            )}
            {note ? <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>{note}</Text> : null}
          </TodayCard>

          {!table ? (
            <TodayCard title="Breakdown">
              {netWorth.isError ? (
                <CardError message="Couldn't load your breakdown." onRetry={() => void netWorth.refetch()} />
              ) : (
                <Skeleton lines={[{ width: '100%', height: 20 }, { width: '100%', height: 20 }, { width: '100%', height: 20 }]} />
              )}
            </TodayCard>
          ) : (
            <>
              <TodayCard title={<Eyebrow>ASSETS</Eyebrow>}>
                {table.assets.map((r) => (
                  <Line key={r.label} label={r.label} amount={formatRupees(r.paise)} onPress={opens(r.label)} />
                ))}
                <Line label="Total assets" amount={formatRupees(table.totalAssets)} strong />
              </TodayCard>
              <TodayCard title={<Eyebrow>LIABILITIES</Eyebrow>}>
                {table.liabilities.map((r) => (
                  <Line key={r.label} label={r.label} amount={formatRupees(r.paise)} onPress={opens(r.label)} />
                ))}
                <Line label="Total liabilities" amount={formatRupees(table.totalLiabilities)} strong />
              </TodayCard>
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.text }}>
                  Net worth = Total assets − Total liabilities
                </Text>
                <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
                  Moving money between your own accounts doesn't change net worth. Investments will be added later.
                </Text>
              </View>
            </>
          )}

      </ScreenScroll>
      <Sheet
        visible={positionOn !== null}
        onClose={() => setPositionOn(null)}
        title={positionOn ? `Your position on ${tooltipDay(positionOn).slice(4)}` : ''}
        subtitle="The ledger as it stood at the end of that day.">
        {position.data && positionOn === position.data.on ? (
          <View style={{ gap: 4 }}>
            <Line label="Available balance" amount={formatRupees(position.data.available_paise)} />
            {position.data.receivables_paise ? <Line label="Money lent" amount={formatRupees(position.data.receivables_paise)} /> : null}
            {position.data.other_assets_paise ? <Line label="Other assets" amount={formatRupees(position.data.other_assets_paise)} /> : null}
            <Line label="Total assets" amount={formatRupees(position.data.total_assets_paise)} strong />
            {position.data.card_dues_paise ? <Line label="Credit card outstanding" amount={formatRupees(position.data.card_dues_paise)} /> : null}
            {position.data.borrowings_paise ? <Line label="Money borrowed" amount={formatRupees(position.data.borrowings_paise)} /> : null}
            {position.data.other_liabilities_paise ? <Line label="Other liabilities" amount={formatRupees(position.data.other_liabilities_paise)} /> : null}
            <Line label="Total liabilities" amount={formatRupees(position.data.total_liabilities_paise)} strong />
            <Line label="Net worth" amount={formatRupees(position.data.net_worth_paise)} strong />
          </View>
        ) : position.isError ? (
          <CardError message="Couldn't load that day." onRetry={() => void position.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 20 }, { width: '100%', height: 20 }, { width: '100%', height: 20 }]} />
        )}
      </Sheet>
    </View>
  );
}

function Line({ label, amount, strong, onPress }: { label: string; amount: string; strong?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, ${amount}`}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: onPress ? 44 : 32,
        alignItems: 'center',
        borderTopWidth: strong ? 1 : 0,
        borderTopColor: COLORS.cardBorder,
        paddingTop: strong ? 8 : 0 }}>
      <Text style={{ fontFamily: strong ? FONT.semibold : FONT.medium, fontSize: 14, color: COLORS.text }}>
        {label}
        {onPress ? ' ›' : ''}
      </Text>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: COLORS.text, fontVariant: ['tabular-nums'] }}>{amount}</Text>
    </TouchableOpacity>
  );
}
