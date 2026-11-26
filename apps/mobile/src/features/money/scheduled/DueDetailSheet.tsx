import { Alert, Text, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { formatDate } from '../dates';
import { useRupees } from '../privacy';
import { categoryName } from '../quickAdd/model';
import { FormError, Sheet } from '../sheets/Sheet';
import type { Account, Occurrence } from '../types';
import { frequencyLabel, KIND_LABEL, statusPill } from './model';

/**
 * Tap a Coming up row (spec 4.8): its details, Mark paid and Skip for this due
 * date, and Edit and Cancel for the item.
 */
export function DueDetailSheet({
  occurrence: o,
  accounts,
  today,
  error,
  busy,
  onClose,
  onPay,
  onSkip,
  onEdit,
  onCancel,
}: {
  occurrence: Occurrence | null;
  accounts: Map<string, Account>;
  today: string;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onPay: (o: Occurrence) => void;
  onSkip: (o: Occurrence) => void;
  onEdit: (o: Occurrence) => void;
  onCancel: (o: Occurrence) => void;
}) {
  const formatRupees = useRupees();
  if (!o) return null;
  const overdue = statusPill(o.due_on, today).tone === 'check';
  const lines: [string, string | null][] = [
    ['Amount', `${formatRupees(o.amount_paise)}${o.variable ? ' (varies)' : ''}`],
    ['Type', KIND_LABEL[o.kind].replace(/s$/, '')],
    ['How often', frequencyLabel(o.frequency)],
    [o.kind === 'income' ? 'Paid into' : 'Paid from', o.account_id ? (accounts.get(o.account_id)?.name ?? 'An archived account') : null],
    ['Category', o.category ? categoryName(o.category) : null],
    [o.kind === 'income' ? 'Expected' : 'Due', formatDate(o.due_on)],
    ['Reminder', o.reminder ? 'On' : 'Off'],
  ];
  const confirmCancel = () =>
    Alert.alert(`Cancel ${o.name}?`, 'Future dues stop. Payments already recorded stay.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel it', style: 'destructive', onPress: () => onCancel(o) },
    ]);
  return (
    <Sheet visible onClose={onClose} title={o.name} subtitle={overdue ? `Was due ${formatDate(o.due_on)}. Was it paid?` : undefined}>
      <View style={{ gap: 10 }}>
        {lines
          .filter((l): l is [string, string] => Boolean(l[1]))
          .map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.muted }}>{label}</Text>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
            </View>
          ))}
      </View>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
        {o.kind === 'income'
          ? 'Expected income is not counted until you confirm it arrived.'
          : 'A due is not an expense until you mark it paid. A passed date never marks it paid by itself.'}
      </Text>
      <FormError message={error} />
      {o.status === 'due' ? (
        <>
          <PrimaryButton label={o.kind === 'income' ? 'Mark received' : 'Mark paid'} onPress={() => onPay(o)} disabled={busy} />
          <SecondaryButton label="Skip this one" onPress={() => onSkip(o)} />
        </>
      ) : null}
      <SecondaryButton label="Edit" onPress={() => onEdit(o)} />
      <Text
        accessibilityRole="button"
        onPress={busy ? undefined : confirmCancel}
        style={{ textAlign: 'center', fontFamily: FONT.semibold, fontSize: 15, color: COLORS.error, paddingVertical: 12 }}>
        Cancel {o.kind === 'income' ? 'this income' : 'this payment'}
      </Text>
    </Sheet>
  );
}
