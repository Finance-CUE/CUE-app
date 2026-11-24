import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { newClientKey } from '@/features/money/accounts';
import { type Bank, suggestNickname } from '@/features/money/banks';
import { BankPicker } from './BankPicker';
import { ChipRow, PrimaryButton, TextField } from '@/features/money/components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '@/features/money/dates';
import { parseRupeesToPaise } from '@/features/money/format';
import { useAddAccount } from '@/features/money/hooks';
import type { AccountKind } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'current', label: 'Current' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'other', label: 'Other' },
];

type DateChoice = 'today' | 'yesterday' | 'other';
const DATE_OPTIONS: { value: DateChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

/** Why a "Balance on" date can't be used, or null. */
export function balanceOnProblem(iso: string | null, today: Date): string | null {
  if (iso === null) return 'Enter the date as DD/MM/YYYY.';
  if (iso > toISODate(today)) return "The balance date can't be in the future.";
  if (iso < '2000-01-01') return 'Choose a date after 2000.';
  return null;
}

/**
 * Spec 4.5 Add account: nickname, type, balance and "Balance on" (suggestion
 * 13), so spends from before that date aren't taken off again. No bank
 * credentials are asked for. The opening balance is not income.
 */
export function AddAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // null = not typed yet, so the nickname follows the bank and type ("HDFC Savings").
  const [name, setName] = useState<string | null>(null);
  const [kind, setKind] = useState<AccountKind>('savings');
  const [bank, setBank] = useState<Bank | null>(null);
  const [amount, setAmount] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice>('today');
  const [otherDate, setOtherDate] = useState('');
  const [clientKey, setClientKey] = useState(newClientKey);
  const mutation = useAddAccount();
  const { run, error } = useGuardedSubmit(visible);

  useEffect(() => {
    if (!visible) return;
    setName(null);
    setKind('savings');
    setBank(null);
    setAmount('');
    setDateChoice('today');
    setOtherDate(toDisplayDate(toISODate(new Date())));
    setClientKey(newClientKey());
  }, [visible]);

  const today = new Date();
  const paise = amount.trim() === '' ? 0 : parseRupeesToPaise(amount);
  const card = kind === 'credit_card';
  const balanceOn =
    dateChoice === 'today' ? toISODate(today) : dateChoice === 'yesterday' ? daysBefore(today, 1) : parseDisplayDate(otherDate);
  const dateProblem = balanceOnProblem(balanceOn, today);
  const cash = kind === 'cash';
  const shownName = name ?? suggestNickname(cash ? undefined : (bank ?? undefined), kind);
  const nickname = shownName.trim();
  const bankSlug = !cash && bank && bank.slug !== 'other' ? bank.slug : undefined;
  const valid = nickname.length >= 1 && nickname.length <= 40 && paise !== null && paise >= 0 && dateProblem === null;

  const submit = () => {
    if (!valid || paise === null || balanceOn === null) return;
    void run(
      () =>
        mutation.mutateAsync({
          today: toISODate(today),
          client_key: clientKey,
          name: nickname,
          kind,
          ...(bankSlug ? { bank: bankSlug } : {}),
          opening_paise: paise,
          balance_on: balanceOn,
        }),
      onClose,
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add account" subtitle="No bank login needed. Just the balance.">
      <ChipRow options={KINDS} value={kind} onChange={setKind} />
      {cash ? null : <BankPicker value={bank?.slug ?? null} onChange={setBank} />}
      <TextField label="Nickname" value={shownName} onChangeText={setName} placeholder="HDFC Savings" maxLength={40} />
      <TextField
        label={card ? 'Amount due on the card' : 'Balance'}
        value={amount}
        onChangeText={setAmount}
        prefix="₹"
        keyboardType="decimal-pad"
      />
      <Text style={{ fontSize: 13, color: COLORS.muted }}>Balance on</Text>
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
      <Text style={{ fontSize: 12, color: COLORS.muted }}>
        Spends you add from before this date won't be taken off again.
      </Text>
      <FormError message={error} />
      <PrimaryButton label="Add account" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
