import type { UseQueryResult } from '@tanstack/react-query';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, HEADING_FONT, TABULAR, TYPE, useDashboardTheme } from '@/features/money/palette';
import { MiniLine } from '../charts/MiniLine';
import { EyeIcon, EyeOffIcon, WalletIcon } from '../components/icons';
import { useSlow } from '../hooks';
import { usePrivacyStore, useRupees } from '../privacy';
import type { NetWorth } from '../types';
import { changeLine, netWorthSentence, shortTime } from './model';
import { CardError, Eyebrow, EmptyState, GhostChip, LightButton, Skeleton, TodayCard } from './parts';

export const WAKING = 'Waking CUE up, this can take up to a minute';

/** "Updating…" while a refetch runs, otherwise "Updated 10:42 am". */
export function Freshness({ query }: { query: UseQueryResult<unknown> }) {
  const text = query.isFetching ? 'Updating…' : `Updated ${shortTime(query.dataUpdatedAt)}`;
  return <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.muted }}>{text}</Text>;
}

/**
 * Spec 4.2. The whole position as of now; a past date on the strip never
 * changes it. Every state is its own: a skeleton on first load (with "Waking
 * CUE up" if the server is slow), an error with Try again, an empty state
 * before any account, and "Updating…" after an entry is saved.
 */
export function NetWorthCard({
  query,
  onBreakdown,
  onUpdateBalance,
  onAccounts,
  onAddAccount,
  spark,
  onSpark,
  leftToSpend,
}: {
  query: UseQueryResult<NetWorth>;
  onBreakdown: () => void;
  onUpdateBalance: () => void;
  onAccounts: () => void;
  onAddAccount: () => void;
  /** The last 30 days of net worth (suggestion 9); tapping opens the chart at 30 days. */
  spark?: number[];
  onSpark?: () => void;
  /** "₹1,240 free to spend today" once a salary date exists; null hides it. */
  leftToSpend?: string | null;
}) {
  const formatRupees = useRupees();
  const theme = useDashboardTheme();
  const hidden = usePrivacyStore((s) => s.hidden);
  const toggle = usePrivacyStore((s) => s.toggle);
  const slow = useSlow(query.isPending);
  const nw = query.data;

  const eye = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
      onPress={toggle}
      hitSlop={12}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
      {hidden ? <EyeOffIcon color={theme.accentText} size={20} /> : <EyeIcon color={theme.accentText} size={20} />}
    </TouchableOpacity>
  );
  const title = <Eyebrow>YOUR NET WORTH</Eyebrow>;

  if (!nw) {
    return (
      <TodayCard title={title} right={eye}>
        {query.isError ? (
          <CardError message="Couldn't load your net worth." onRetry={() => void query.refetch()} />
        ) : (
          <>
            <Skeleton lines={[{ width: '60%', height: 36 }, { width: '40%', height: 12 }, { width: '100%', height: 40 }]} />
            {slow ? <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>{WAKING}</Text> : null}
          </>
        )}
      </TodayCard>
    );
  }

  if (nw.accounts.length === 0) {
    return (
      <TodayCard title={title}>
        <EmptyState
          icon={<WalletIcon color={theme.accent} size={48} />}
          text="Where does your money stand?"
          action="Add an account"
          onAction={onAddAccount}
        />
      </TodayCard>
    );
  }

  const change = changeLine(nw.change_this_month_paise, formatRupees);
  return (
    <TodayCard title={title} right={eye}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${netWorthSentence(nw, formatRupees)}. Opens the breakdown.`}
          onPress={onBreakdown}
          activeOpacity={0.7}
          style={{ gap: 4, flex: 1 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...TYPE.hero, color: COLORS.text }}>
            {formatRupees(nw.net_worth_paise)}
          </Text>
          {change ? <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>{change.text}</Text> : null}
        </TouchableOpacity>
        {spark && spark.length > 1 ? <MiniLine values={spark} onPress={onSpark} /> : null}
      </View>
      {leftToSpend ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted, marginTop: -4 }}>{leftToSpend}</Text>
      ) : null}

      <View style={{ height: 1, backgroundColor: COLORS.cardBorder }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Figure label="AVAILABLE BALANCE" value={formatRupees(nw.available_paise)} />
        <Figure label="LIABILITIES" value={formatRupees(nw.total_liabilities_paise)} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <LightButton label="View breakdown" onPress={onBreakdown} />
        <GhostChip label="Update balance" onPress={onUpdateBalance} />
        <GhostChip label="Accounts" onPress={onAccounts} />
      </View>
      <Freshness query={query} />
    </TodayCard>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Eyebrow>{label}</Eyebrow>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 22, color: COLORS.text, fontFamily: HEADING_FONT, ...TABULAR }}>
        {value}
      </Text>
    </View>
  );
}
