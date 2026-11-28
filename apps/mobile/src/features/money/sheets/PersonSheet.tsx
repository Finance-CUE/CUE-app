import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { toErrorMessage } from '@/lib/api';
import { Card, PrimaryButton } from '../components/ui';
import { formatDateTime } from '../dates';
import { formatRupees } from '../format';
import { useDeleteKhata, useSettleKhata } from '../hooks';
import type { PersonBalance } from '../khata';
import type { KhataEntry, PaymentMethod } from '../types';
import { FormError, Sheet } from './Sheet';

/** One modal listing a person's open entries; the screen closes it when the last one goes. */
export function PersonSheet({
  person,
  onClose,
}: {
  person: PersonBalance | undefined;
  onClose: () => void;
}) {
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

  // Paying back a debt is a real payment, logged as a spend; ask how it was paid first.
  const markSettled = (e: KhataEntry) => {
    if (e.direction === 'lent') {
      void act(() => settle.mutateAsync({ id: e.id }));
      return;
    }
    const pay = (method: PaymentMethod) => void act(() => settle.mutateAsync({ id: e.id, method }));
    Alert.alert(
      `How did you pay ${e.person} back?`,
      `${formatRupees(e.amount_paise)} will be logged as a payment and taken off your balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Cash', onPress: () => pay('cash') },
        { text: 'UPI', onPress: () => pay('upi') },
      ],
    );
  };

  return (
    <Sheet visible={person !== undefined} onClose={onClose} title={person?.person ?? ''}>
      <FormError message={error} />
      {person?.entries.map((e) => (
        <Card key={e.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, color: COLORS.text }}>{e.direction === 'lent' ? 'You lent' : 'You borrowed'}</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>{formatRupees(e.amount_paise)}</Text>
          </View>
          {e.note ? <Text style={{ fontSize: 13, color: COLORS.text }}>{e.note}</Text> : null}
          <Text style={{ fontSize: 12, color: COLORS.muted }}>{formatDateTime(e.created_at)}</Text>
          <PrimaryButton
            label={e.direction === 'lent' ? 'Mark received' : 'Mark paid back'}
            onPress={() => markSettled(e)}
            disabled={busy}
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
              opacity: busy ? 0.4 : 1,
            }}>
            <Text style={{ color: COLORS.error, fontSize: 16, fontWeight: '600' }}>Delete</Text>
          </TouchableOpacity>
        </Card>
      ))}
    </Sheet>
  );
}
