import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';
import { CategoryIcon, RupeeIcon, SwapIcon } from '../components/icons';
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

/**
 * Money in. The sage token (#92A98A) is about 2.5:1 on white, below the 4.5:1
 * text needs; this darker sage is about 5.5:1. P1's brand-kit roles replace it.
 */
const POSITIVE_INK = '#56704D';

/** One transaction row, as the spec's "Row by type" table shows it. */
export function TxnRow({ txn, accounts, onPress }: { txn: LedgerTxn; accounts: Map<string, Account>; onPress: () => void }) {
  const theme = useArchetypeTheme();
  const formatRupees = useRupees();
  const row = rowFor(txn, accounts, formatRupees);
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
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '500', color: COLORS.text }}>
          {row.title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 11.5, color: COLORS.muted }}>
          {row.subtitle}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: tone[row.tone] }}>{row.amount}</Text>
    </TouchableOpacity>
  );
}
