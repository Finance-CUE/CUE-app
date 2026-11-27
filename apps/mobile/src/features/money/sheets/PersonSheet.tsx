import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { toErrorMessage } from '@/lib/api';
import { Card, PrimaryButton, SecondaryButton } from '../components/ui';
import { formatDate, formatDateTime } from '../dates';
import { useRupees } from '../privacy';
import { useDeleteKhata, useSettleKhata } from '../hooks';
import type { PersonBalance } from '../khata';
import type { KhataEntry, PaymentMethod } from '../types';
import { FormError, Sheet } from './Sheet';

/** One modal listing a person's open entries; the screen closes it when the last one goes. */
export function PersonSheet({
  person,
  onClose,
  onRecordPayment,
}: {
  person: PersonBalance | undefined;
  onClose: () => void;
  /** Part payments (P3): opens the Settlement sheet for this person. */
  onRecordPayment?: (person: PersonBalance) => void;
}) {
  // Masked while the eye toggle hides amounts.
  const formatRupees = useRupees();
  const settle = useSettleKhata();
  const remove = useDeleteKhata();
  const [error, setError] = useState<string | null>(null);
  const busy = settle.isPending || remove.isPending;

  useEffect(() => {
    setError(null);
  }, [person?.key]);

  const inFlight = useRef(false);

  const act = async (action: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(toErrorMessage(err, "We couldn't update this entry. Please try again."));
    } finally {
      inFlight.current = false;
    }
  };

  // Settling moves real money either way: ask how, so it lands in Cash or the bank.
  const markSettled = (e: KhataEntry) => {
    const pay = (method: PaymentMethod) => void act(() => settle.mutateAsync({ id: e.id, method }));
    const lent = e.direction === 'lent';
    Alert.alert(
      lent ? `How did ${e.person} pay you back?` : `How did you pay ${e.person} back?`,
      lent
        ? `${formatRupees(e.outstanding_paise ?? e.amount_paise)} will be added back to your cash or bank balance.`
        : `${formatRupees(e.outstanding_paise ?? e.amount_paise)} will be taken from your cash or bank balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Cash', onPress: () => pay('cash') },
        { text: 'UPI', onPress: () => pay('upi') },
      ],
    );
  };

  return (
    <Sheet
      visible={person !== undefined}
      onClose={onClose}
      title={person?.person ?? ''}
      subtitle={
        person
          ? person.net_paise > 0
            ? `Owes you ${formatRupees(person.net_paise)}`
            : person.net_paise < 0
              ? `You owe ${formatRupees(-person.net_paise)}`
              : 'All square'
          : undefined
      }>
      {person && onRecordPayment ? (
        <PrimaryButton label="Record a payment" onPress={() => onRecordPayment(person)} disabled={busy} />
      ) : null}
      <FormError message={error} />
      {person?.entries.map((e) => (
        <Card key={e.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.text }}>{e.direction === 'lent' ? 'You lent' : 'You borrowed'}</Text>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: COLORS.text }}>{formatRupees(e.amount_paise)}</Text>
          </View>
          {e.outstanding_paise !== undefined && e.outstanding_paise !== null && e.outstanding_paise !== e.amount_paise ? (
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text }}>
              {formatRupees(e.outstanding_paise)} still open after part payments
            </Text>
          ) : null}
          {e.due_on ? (
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text }}>Due {formatDate(e.due_on)}</Text>
          ) : null}
          {e.note ? <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text }}>{e.note}</Text> : null}
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>{formatDateTime(e.created_at)}</Text>
          <SecondaryButton
            label={e.direction === 'lent' ? 'Mark fully received' : 'Mark fully paid back'}
            onPress={() => markSettled(e)}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void act(() => remove.mutateAsync(e.id))}
            activeOpacity={0.7}
            style={{
              height: 52,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: COLORS.error,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.4 : 1 }}>
            <Text style={{ fontFamily: FONT.semibold, color: COLORS.error, fontSize: 16 }}>Delete</Text>
          </TouchableOpacity>
        </Card>
      ))}
    </Sheet>
  );
}
