import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { Card, EmptyCard, Row, ScreenScroll } from '../components/ui';
import { Sparkline } from '../components/Sparkline';
import { toISODate } from '../dates';
import { countPoints } from '../chart';
import { formatRupees } from '../format';
import { useSummary, useToday, useTrend } from '../hooks';
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
  const theme = useArchetypeTheme();
  const router = useRouter();
  const summary = useSummary();
  const trend = useTrend(toISODate(useToday()));

  const s = summary.data;
  const start = s?.starting_money;
  const points = trend.data ?? [];
  const known = countPoints(points.map((p) => p.balance_paise));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 16, color: theme.accentText, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 14, color: COLORS.muted }}>Net worth</Text>
            <Text style={{ fontSize: 34, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>
              {s?.net_worth_paise != null ? formatRupees(s.net_worth_paise) : '—'}
            </Text>
          </View>

          {summary.isError ? (
            <EmptyCard text="Could not load your balances." />
          ) : summary.isLoading ? (
            <Card>
              <ActivityIndicator color={theme.accent} />
            </Card>
          ) : (
            <Card>
              <Row title="Bank" amount={start ? formatRupees(start.bank_paise) : '—'} />
              <Row title="Cash" amount={start ? formatRupees(start.cash_paise) : '—'} />
              <Row title="Money lent" amount={formatRupees(s?.owed_to_you_paise ?? 0)} />
              <Row title="Money borrowed" amount={formatRupees(s?.you_owe_paise ?? 0)} />
              {s && s.spent_since_update_paise > 0 ? (
                <Row
                  title="Spent since last update"
                  subtitle="Logged after you last set your balance"
                  amount={formatRupees(-s.spent_since_update_paise)}
                />
              ) : null}
            </Card>
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
                Set your balance to see how it moves over time.
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
