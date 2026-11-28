import { useEffect, useState } from 'react';

import { CATEGORIES, suggestCategory } from '@/features/money/categories';
import { ChipRow, PrimaryButton, TextField } from '@/features/money/components/ui';
import { daysBefore, parseDisplayDate, spendDateProblem, toDisplayDate, toISODate } from '@/features/money/dates';
import { paiseToInput, parseRupeesToPaise } from '@/features/money/format';
import { useLogSpend, useUpdateSpend } from '@/features/money/hooks';
import type { Category, Spend } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: c.label }));
// A logged spend cannot become a subscription payment (or stop being one).
const EDIT_OPTIONS = OPTIONS.filter((o) => o.value !== 'subscription');

type DateChoice = 'today' | 'yesterday' | 'other';
const DATE_OPTIONS: { value: DateChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

/** Integer 1-31 or null. */
export const parseBillingDay = (text: string): number | null => {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 1 && n <= 31 ? n : null;
};

function choiceFor(iso: string, today: Date): DateChoice {
  if (iso === toISODate(today)) return 'today';
  if (iso === daysBefore(today, 1)) return 'yesterday';
  return 'other';
}

/**
 * Log a new spend, or edit one when `editing` is set. `defaultDate` (ISO) pre-selects
 * the day for a new spend, e.g. the day picked on the week chart.
 */
export function LogSpendSheet({
  visible,
  onClose,
  editing = null,
  defaultDate,
}: {
  visible: boolean;
  onClose: () => void;
  editing?: Spend | null;
  defaultDate?: string;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  // A manual pick always wins; the description only suggests while nothing is picked.
  const [picked, setPicked] = useState<Category | null>(null);
  const [billingDay, setBillingDay] = useState(() => String(new Date().getDate()));
  const [dateChoice, setDateChoice] = useState<DateChoice>('today');
  const [otherDate, setOtherDate] = useState('');
  const create = useLogSpend();
  const update = useUpdateSpend();
  const mutation = editing ? update : create;
  const { run, error } = useGuardedSubmit(visible);

  // Seed the form only when the sheet opens, never while the user is typing.
  useEffect(() => {
    if (!visible) return;
    const today = new Date();
    const start = editing?.spent_on ?? defaultDate ?? toISODate(today);
    setDescription(editing?.description ?? '');
    setAmount(editing ? paiseToInput(editing.amount_paise) : '');
    setPicked(editing?.category ?? null);
    setBillingDay(String(today.getDate()));
    setDateChoice(choiceFor(start, today));
    setOtherDate(toDisplayDate(start));
  }, [visible, editing, defaultDate]);

  const today = new Date();
  const paise = parseRupeesToPaise(amount);
  const text = description.trim();
  const category = picked ?? suggestCategory(text);
  const day = parseBillingDay(billingDay);
  const isSub = category === 'subscription';
  const tooLong = isSub && text.length > 60;
  const spentOn =
    dateChoice === 'today' ? toISODate(today) : dateChoice === 'yesterday' ? daysBefore(today, 1) : parseDisplayDate(otherDate);
  const dateProblem = spendDateProblem(spentOn, today);
  const valid =
    text.length >= 1 &&
    text.length <= (isSub ? 60 : 80) &&
    paise !== null &&
    paise > 0 &&
    category !== null &&
    (!isSub || day !== null) &&
    dateProblem === null;

  const submit = () => {
    if (!valid || paise === null || category === null || spentOn === null) return;
    const action = editing
      ? () =>
          update.mutateAsync({
            id: editing.id,
            description: text,
            amount_paise: paise,
            category: category === 'subscription' ? 'other' : category,
            spent_on: spentOn,
          })
      : () =>
          create.mutateAsync({
            description: text,
            amount_paise: paise,
            category,
            spent_on: spentOn,
            ...(isSub && day !== null ? { billing_day: day } : {}),
          });
    void run(action, onClose);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={editing ? 'Edit spend' : 'Log a spend'}>
      <TextField label="What was it?" value={description} onChangeText={setDescription} maxLength={80} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <ChipRow options={editing ? EDIT_OPTIONS : OPTIONS} value={category} onChange={setPicked} />
      {isSub ? (
        <TextField label="Billing day" value={billingDay} onChangeText={setBillingDay} keyboardType="number-pad" maxLength={2} />
      ) : null}
      <ChipRow options={DATE_OPTIONS} value={dateChoice} onChange={setDateChoice} />
      {dateChoice === 'other' ? (
        <TextField
          label="Date (DD/MM/YYYY)"
          value={otherDate}
          onChangeText={setOtherDate}
          placeholder="DD/MM/YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      ) : null}
      {dateChoice === 'other' && otherDate.length >= 10 ? <FormError message={dateProblem} /> : null}
      {tooLong ? <FormError message="Subscription names can be 60 characters at most." /> : null}
      <FormError message={error} />
      <PrimaryButton
        label={editing ? 'Save changes' : 'Log'}
        onPress={submit}
        disabled={!valid || mutation.isPending}
        loading={mutation.isPending}
      />
    </Sheet>
  );
}
