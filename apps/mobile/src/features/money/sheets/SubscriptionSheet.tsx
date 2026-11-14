import { useEffect, useState } from 'react';

import { PrimaryButton, TextField } from '@/features/money/components/ui';
import { toISODate } from '@/features/money/dates';
import { parseRupeesToPaise } from '@/features/money/format';
import { useAddSubscription } from '@/features/money/hooks';
import { parseBillingDay } from './LogSpendSheet';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

export function SubscriptionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [billingDay, setBillingDay] = useState(() => String(new Date().getDate()));
  const mutation = useAddSubscription();
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(amount);
  const trimmed = name.trim();
  const day = parseBillingDay(billingDay);
  const valid = trimmed.length >= 1 && trimmed.length <= 60 && paise !== null && paise > 0 && day !== null;

  // Re-seed the default only when the sheet opens, never while the user is typing.
  useEffect(() => {
    if (visible) setBillingDay(String(new Date().getDate()));
  }, [visible]);

  const submit = () => {
    if (!valid || paise === null || day === null) return;
    void run(
      () =>
        mutation.mutateAsync({ name: trimmed, amount_paise: paise, billing_day: day, starts_on: toISODate(new Date()) }),
      () => {
        setName('');
        setAmount('');
        setBillingDay(String(new Date().getDate()));
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add a subscription">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <TextField label="Billing day" value={billingDay} onChangeText={setBillingDay} keyboardType="number-pad" maxLength={2} />
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
