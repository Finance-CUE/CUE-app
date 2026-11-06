import { useEffect, useState } from 'react';

import { CATEGORIES, suggestCategory } from '@/features/money/categories';
import { ChipRow, PrimaryButton, TextField } from '@/features/money/components/ui';
import { toISODate } from '@/features/money/dates';
import { parseRupeesToPaise } from '@/features/money/format';
import { useLogSpend } from '@/features/money/hooks';
import type { Category } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: c.label }));

/** Integer 1-31 or null. */
export const parseBillingDay = (text: string): number | null => {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 1 && n <= 31 ? n : null;
};

export function LogSpendSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  // A manual pick always wins; the description only suggests while nothing is picked.
  const [picked, setPicked] = useState<Category | null>(null);
  const [billingDay, setBillingDay] = useState(() => String(new Date().getDate()));
  const mutation = useLogSpend();
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(amount);
  const text = description.trim();
  const category = picked ?? suggestCategory(text);
  const day = parseBillingDay(billingDay);
  const isSub = category === 'subscription';
  const tooLong = isSub && text.length > 60;
  const valid =
    text.length >= 1 && text.length <= (isSub ? 60 : 80) && paise !== null && paise > 0 && category !== null && (!isSub || day !== null);

  // Re-seed the default only when the sheet opens, never while the user is typing.
  useEffect(() => {
    if (visible) setBillingDay(String(new Date().getDate()));
  }, [visible]);

  const submit = () => {
    if (!valid || paise === null || category === null) return;
    void run(
      () =>
        mutation.mutateAsync({
          description: text,
          amount_paise: paise,
          category,
          spent_on: toISODate(new Date()),
          ...(isSub && day !== null ? { billing_day: day } : {}),
        }),
      () => {
        setDescription('');
        setAmount('');
        setPicked(null);
        setBillingDay(String(new Date().getDate()));
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Log a spend">
      <TextField label="What was it?" value={description} onChangeText={setDescription} maxLength={80} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <ChipRow options={OPTIONS} value={category} onChange={setPicked} />
      {isSub ? (
        <TextField label="Billing day" value={billingDay} onChangeText={setBillingDay} keyboardType="number-pad" maxLength={2} />
      ) : null}
      {tooLong ? <FormError message="Subscription names can be 60 characters at most." /> : null}
      <FormError message={error} />
      <PrimaryButton label="Log" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
