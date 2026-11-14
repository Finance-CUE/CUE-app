import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { PrimaryButton, ScreenScroll, TextField } from '../components/ui';
import { parseRupeesToPaise } from '../format';
import { useSetStartingMoney } from '../hooks';
import { useAuthStore } from '@/features/auth/store';
import { FormError, useGuardedSubmit } from '../sheets/Sheet';
import type { MoneySummary } from '../types';

export function BalanceOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bank, setBank] = useState('');
  const [cash, setCash] = useState('');
  const signOut = useAuthStore((s) => s.signOut);
  const mutation = useSetStartingMoney();
  const { run, error } = useGuardedSubmit(true);

  const bankPaise = bank.trim() === '' ? null : parseRupeesToPaise(bank);
  const cashPaise = cash.trim() === '' ? 0 : parseRupeesToPaise(cash);
  const valid = bankPaise !== null && cashPaise !== null;

  const submit = () => {
    if (bankPaise === null || cashPaise === null) return;
    void run(
      async () => {
        const saved = await mutation.mutateAsync({ bank_paise: bankPaise, cash_paise: cashPaise });
        // The tabs gate reads this cache; write it before routing so it cannot bounce us back.
        queryClient.setQueryData<MoneySummary>(['money', 'summary'], (old) =>
          old ? { ...old, starting_money: saved } : old,
        );
        void queryClient.invalidateQueries({ queryKey: ['money', 'summary'] });
      },
      () => router.replace('/today'),
    );
  };

  return (
    <ScreenScroll>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, color: COLORS.text, fontFamily: HEADING_FONT }}>Where does your money stand?</Text>
        <Text style={{ fontSize: 15, color: COLORS.muted }}>
          Enter what you have today so CUE can show your full picture. You can update it any time.
        </Text>
      </View>
      <TextField label="Bank balance" value={bank} onChangeText={setBank} prefix="₹" placeholder="0" keyboardType="decimal-pad" />
      <TextField label="Cash in hand (optional)" value={cash} onChangeText={setCash} prefix="₹" placeholder="0" keyboardType="decimal-pad" />
      <FormError message={error} />
      <PrimaryButton label="Continue" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
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
