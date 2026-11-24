import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { newClientKey } from '../accounts';
import * as moneyApi from '../api';
import { type Bank, suggestNickname } from '../banks';
import { ChipRow, PrimaryButton, ScreenScroll, TextField } from '../components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { parseRupeesToPaise } from '../format';
import { useAddAccount } from '../hooks';
import { balanceOnProblem } from '../sheets/AddAccountSheet';
import { BankPicker } from '../sheets/BankPicker';
import { FormError, useGuardedSubmit } from '../sheets/Sheet';

type DateChoice = 'today' | 'yesterday' | 'other';
const DATE_OPTIONS: { value: DateChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

/**
 * First run (spec P0): the user's bank account and cash, each with its
 * balance "as on" a date, so spends logged later from before that date are
 * not taken off twice. Saved as two accounts with opening balances.
 */
export function BalanceOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankAmount, setBankAmount] = useState('');
  const [cash, setCash] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice>('today');
  const [otherDate, setOtherDate] = useState(() => toDisplayDate(toISODate(new Date())));
  // Fixed per screen: if the second save fails, retrying never makes the first account twice.
  const [keys] = useState(() => ({ bank: newClientKey(), cash: newClientKey() }));
  const add = useAddAccount();
  const { run, error } = useGuardedSubmit(true);

  const today = new Date();
  const bankPaise = bankAmount.trim() === '' ? null : parseRupeesToPaise(bankAmount);
  const cashPaise = cash.trim() === '' ? 0 : parseRupeesToPaise(cash);
  const balanceOn =
    dateChoice === 'today' ? toISODate(today) : dateChoice === 'yesterday' ? daysBefore(today, 1) : parseDisplayDate(otherDate);
  const dateProblem = balanceOnProblem(balanceOn, today);
  const valid = bankPaise !== null && cashPaise !== null && dateProblem === null;

  const submit = () => {
    if (bankPaise === null || cashPaise === null || balanceOn === null) return;
    const todayISO = toISODate(today);
    const slug = bank && bank.slug !== 'other' ? bank.slug : undefined;
    void run(
      async () => {
        await add.mutateAsync({
          today: todayISO,
          client_key: keys.bank,
          name: suggestNickname(bank ?? undefined, 'savings') || 'Bank',
          kind: 'savings',
          ...(slug ? { bank: slug } : {}),
          opening_paise: bankPaise,
          balance_on: balanceOn,
        });
        await add.mutateAsync({
          today: todayISO,
          client_key: keys.cash,
          name: 'Cash',
          kind: 'cash',
          opening_paise: cashPaise,
          balance_on: balanceOn,
        });
        // The tabs gate reads the summary; have it fresh before routing so it can't bounce us back.
        await queryClient.fetchQuery({ queryKey: ['money', 'summary'], queryFn: moneyApi.fetchSummary });
      },
      () => router.replace('/today'),
    );
  };

  return (
    <ScreenScroll>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, color: COLORS.text, fontFamily: HEADING_FONT }}>Where does your money stand?</Text>
        <Text style={{ fontSize: 15, color: COLORS.muted }}>
          Enter what you have so CUE can show your full picture. No bank login needed. You can add more accounts later.
        </Text>
      </View>
      <BankPicker value={bank?.slug ?? null} onChange={setBank} />
      <TextField label="Bank balance" value={bankAmount} onChangeText={setBankAmount} prefix="₹" placeholder="0" keyboardType="decimal-pad" />
      <TextField label="Cash in hand (optional)" value={cash} onChangeText={setCash} prefix="₹" placeholder="0" keyboardType="decimal-pad" />
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
      <Text style={{ fontSize: 12, color: COLORS.muted }}>Spends you add from before this date won't be taken off again.</Text>
      <FormError message={error} />
      <PrimaryButton label="Continue" onPress={submit} disabled={!valid || add.isPending} loading={add.isPending} />
      <TouchableOpacity
        accessibilityRole="button"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
        style={{ alignSelf: 'center', paddingVertical: 12 }}>
        <Text style={{ color: COLORS.muted, fontSize: 14 }}>Sign out</Text>
      </TouchableOpacity>
    </ScreenScroll>
  );
}
