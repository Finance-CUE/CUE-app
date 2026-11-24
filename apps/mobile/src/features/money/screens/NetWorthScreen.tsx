import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { Card, ScreenScroll } from '../components/ui';
import { Sparkline } from '../components/Sparkline';
import { toISODate } from '../dates';
import { countPoints } from '../chart';
import { usePrivacyStore, useRupees } from '../privacy';
import { useNetWorth, useToday, useTrend } from '../hooks';
import { breakdown, changeLine, netWorthSentence } from '../today/model';
import { CardError, Eyebrow, Skeleton, TodayCard } from '../today/parts';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 13, color: COLORS.muted }}>{label}</Text>
    </View>
  );
}

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
  const theme = useArchetypeTheme();
  const router = useRouter();
  const hidden = usePrivacyStore((st) => st.hidden);
  const toggle = usePrivacyStore((st) => st.toggle);
  const todayISO = toISODate(useToday());
  const netWorth = useNetWorth(todayISO);
  const trend = useTrend(todayISO);

  const nw = netWorth.data;
  const points = trend.data ?? [];
  const known = countPoints(points.map((p) => p.balance_paise));
  const change = nw ? changeLine(nw.change_this_month_paise, formatRupees) : null;
  const table = nw ? breakdown(nw, nw.accounts) : null;

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
              <Text style={{ fontSize: 16, color: theme.accentText, fontWeight: '600' }}>‹ Back</Text>
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
            <Text style={{ fontSize: 14, color: COLORS.muted }}>Net worth</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 40, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>
              {nw ? formatRupees(nw.net_worth_paise) : '—'}
            </Text>
            {change ? <Text style={{ fontSize: 12.5, color: COLORS.muted }}>{change.text}</Text> : null}
          </View>

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
                  <Line key={r.label} label={r.label} amount={formatRupees(r.paise)} />
                ))}
                <Line label="Total assets" amount={formatRupees(table.totalAssets)} strong />
              </TodayCard>
              <TodayCard title={<Eyebrow>LIABILITIES</Eyebrow>}>
                {table.liabilities.map((r) => (
                  <Line key={r.label} label={r.label} amount={formatRupees(r.paise)} />
                ))}
                <Line label="Total liabilities" amount={formatRupees(table.totalLiabilities)} strong />
              </TodayCard>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 13, color: COLORS.text, fontWeight: '600' }}>
                  Net worth = Total assets − Total liabilities
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.muted }}>
                  Moving money between your own accounts doesn't change net worth. Investments will be added later.
                </Text>
              </View>
            </>
          )}

          <Card>
            <Text style={{ fontSize: 16, color: COLORS.text, fontFamily: HEADING_FONT, marginBottom: 12 }}>
              Last 30 days
            </Text>
            {trend.isError ? (
              <Text style={{ color: COLORS.muted, fontSize: 14 }}>Could not load the trend.</Text>
            ) : trend.isLoading ? (
              <ActivityIndicator color={theme.accent} />
            ) : known === 0 ? (
              <Text style={{ color: COLORS.muted, fontSize: 14 }}>
                Add an account to see how your balance moves over time.
              </Text>
            ) : (
              <>
                <Sparkline points={points} width={280} height={120} />
                {known === 1 ? (
                  <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8 }}>
                    Your line starts today. It moves as you log spends and update your balance.
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                  <Dot color={theme.accent} label="Balance" />
                  <Dot color={COLORS.peach} label="Spending" />
                </View>
              </>
            )}
          </Card>
      </ScreenScroll>
    </View>
  );
}

function Line({ label, amount, strong }: { label: string; amount: string; strong?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 32,
        alignItems: 'center',
        borderTopWidth: strong ? 1 : 0,
        borderTopColor: COLORS.cardBorder,
        paddingTop: strong ? 8 : 0,
      }}>
      <Text style={{ fontSize: 14, color: COLORS.text, fontWeight: strong ? '700' : '500' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: COLORS.text, fontWeight: strong ? '700' : '600' }}>{amount}</Text>
    </View>
  );
}
