import { useState } from 'react';

import { ChipRow, PrimaryButton, TextField } from '@/features/money/components/ui';
import { parseDisplayDate } from '@/features/money/dates';
import { parseRupeesToPaise } from '@/features/money/format';
import { useAddSubscription } from '@/features/money/hooks';
import type { Cadence } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** DD/MM/YYYY one month from today, day clamped to the target month's length. */
function defaultDue(): string {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(now.getDate(), lastDay));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function SubscriptionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [due, setDue] = useState(defaultDue);
  const mutation = useAddSubscription();
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(amount);
  const trimmed = name.trim();
  const dueIso = parseDisplayDate(due);
  const valid = trimmed.length >= 1 && trimmed.length <= 60 && paise !== null && paise > 0 && dueIso !== null;

  const submit = () => {
    if (!valid || paise === null || dueIso === null) return;
    void run(
      () => mutation.mutateAsync({ name: trimmed, amount_paise: paise, cadence, next_due_on: dueIso }),
      () => {
        setName('');
        setAmount('');
        setCadence('monthly');
        setDue(defaultDue());
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add a subscription">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <ChipRow options={CADENCES} value={cadence} onChange={setCadence} />
      <TextField
        label="Next due"
        value={due}
        onChangeText={setDue}
        placeholder="DD/MM/YYYY"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
