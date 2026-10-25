import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { PrimaryButton, TextField } from '@/features/money/components/ui';
import { formatRupees, parseRupeesToPaise } from '@/features/money/format';
import { useSetStartingMoney } from '@/features/money/hooks';
import type { StartingMoney } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const toText = (paise: number | undefined) => (paise ? String(paise / 100) : '');

/** Blank counts as 0; non-blank text must parse. */
const parseOrZero = (text: string) => (text.trim() === '' ? 0 : parseRupeesToPaise(text));

export function StartingMoneySheet({
  visible,
  onClose,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  initial: StartingMoney | null;
}) {
  const [bank, setBank] = useState(toText(initial?.bank_paise));
  const [cash, setCash] = useState(toText(initial?.cash_paise));
  const mutation = useSetStartingMoney();
  const { run, error } = useGuardedSubmit(visible);

  // Re-seed from the saved values each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setBank(toText(initial?.bank_paise));
      setCash(toText(initial?.cash_paise));
    }
  }, [visible, initial]);

  const bankPaise = parseOrZero(bank);
  const cashPaise = parseOrZero(cash);
  const valid = bankPaise !== null && cashPaise !== null;
  const total = valid ? bankPaise + cashPaise : 0;

  const submit = () => {
    if (bankPaise === null || cashPaise === null) return;
    void run(() => mutation.mutateAsync({ bank_paise: bankPaise, cash_paise: cashPaise }), onClose);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Set up your starting money"
      subtitle="What do you already have? Leave either at ₹0.">
      <TextField label="Bank" value={bank} onChangeText={setBank} prefix="₹" placeholder="0" keyboardType="decimal-pad" />
      <TextField label="Cash" value={cash} onChangeText={setCash} prefix="₹" placeholder="0" keyboardType="decimal-pad" />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.cardBorder,
        }}>
        <Text style={{ fontSize: 15, color: COLORS.muted }}>Total starting money</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>{formatRupees(total)}</Text>
      </View>
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
