import { useState } from 'react';

import { CATEGORIES } from '@/features/money/categories';
import { ChipRow, PrimaryButton, TextField } from '@/features/money/components/ui';
import { toISODate } from '@/features/money/dates';
import { parseRupeesToPaise } from '@/features/money/format';
import { useLogSpend } from '@/features/money/hooks';
import type { Category } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: c.label }));

export function LogSpendSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const mutation = useLogSpend();
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(amount);
  const text = description.trim();
  const valid = text.length >= 1 && text.length <= 80 && paise !== null && paise > 0 && category !== null;

  const submit = () => {
    if (!valid || paise === null || category === null) return;
    void run(
      () => mutation.mutateAsync({ description: text, amount_paise: paise, category, spent_on: toISODate(new Date()) }),
      () => {
        setDescription('');
        setAmount('');
        setCategory(null);
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Log a spend">
      <TextField label="What was it?" value={description} onChangeText={setDescription} maxLength={80} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <ChipRow options={OPTIONS} value={category} onChange={setCategory} />
      <FormError message={error} />
      <PrimaryButton label="Log" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
