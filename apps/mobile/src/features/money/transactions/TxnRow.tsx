import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, POSITIVE_INK, useDashboardTheme } from '@/features/money/palette';
import { CategoryIcon, RupeeIcon, SwapIcon } from '../components/icons';
import { useGroups } from '../hooks';
import { useRupees } from '../privacy';
import type { Account, LedgerTxn } from '../types';
import { rowFor, type Tone } from './model';

// The old icon set knows the old category slugs.
const ICON_SLUG: Record<string, string> = {
  food_delivery: 'food',
  entertainment: 'fun',
  subscriptions: 'subscription',
  groceries: 'groceries',
  transport: 'transport',
  shopping: 'shopping',
  bills: 'bills',
};

/** One transaction row, as the spec's "Row by type" table shows it. */
export function TxnRow({
  txn,
  accounts,
  onPress,
  onLongPress,
}: {
  txn: LedgerTxn;
  accounts: Map<string, Account>;
  onPress: () => void;
  /** Long-press to fix the category (suggestion 18). */
  onLongPress?: () => void;
}) {
  const theme = useDashboardTheme();
  const formatRupees = useRupees();
  const groups = useGroups().data?.groups;
  const names = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const row = rowFor(txn, accounts, formatRupees, names);
  const fixable = (txn.type === 'expense' || txn.type === 'income') && !txn.group_id;
  const tone: Record<Tone, string> = { ink: COLORS.text, positive: POSITIVE_INK, soft: COLORS.muted };
  const icon =
    txn.type === 'expense' || txn.type === 'refund' ? (
      <CategoryIcon category={ICON_SLUG[txn.category ?? ''] ?? 'other'} color={theme.accentText} />
    ) : txn.type === 'income' ? (
      <RupeeIcon color={theme.accentText} />
    ) : (
      <SwapIcon color={theme.accentText} />
    );
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={row.spoken}
      accessibilityHint={onLongPress && fixable ? 'Long-press to change the category' : undefined}
      accessibilityActions={onLongPress && fixable ? [{ name: 'longpress', label: 'Change category' }] : undefined}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? onLongPress?.() : undefined)}
      onPress={onPress}
      onLongPress={onLongPress && fixable ? onLongPress : undefined}
      delayLongPress={350}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text }}>
          {row.title}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.muted }}>
          {row.subtitle}
        </Text>
      </View>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: tone[row.tone] }}>{row.amount}</Text>
    </TouchableOpacity>
  );
}
