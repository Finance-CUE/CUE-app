import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { newClientKey } from '@/features/money/accounts';
import { ChipRow, PrimaryButton, SecondaryButton, TextField } from '@/features/money/components/ui';
import { toISODate } from '@/features/money/dates';
import { parseRupeesToPaise } from '@/features/money/format';
import { useAdjustBalance } from '@/features/money/hooks';
import { useRupees } from '@/features/money/privacy';
import { ADJUST_REASONS, type AdjustReason, balanceDifference } from '@/features/money/today/model';
import type { Account } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

/**
 * Spec 4.2 Update balance: pick an account, type what the bank shows, see the
 * difference and pick a reason. Saving records a dated adjustment; past entries
 * are never edited. A missed transaction is offered as an expense first.
 */
export function UpdateBalanceSheet({
  visible,
  onClose,
  accounts,
  initialAccountId,
  onAddExpense,
  reconcile = false,
}: {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  initialAccountId?: string | null;
  /** Reconcile (account screen): the same adjustment, framed as checking against a statement. */
  reconcile?: boolean;
  /** "Add it as an expense instead": the caller opens the expense form. */
  onAddExpense: () => void;
}) {
  const formatRupees = useRupees();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<AdjustReason | null>(null);
  const [clientKey, setClientKey] = useState(newClientKey);
  const mutation = useAdjustBalance();
  const { run, error } = useGuardedSubmit(visible);

  useEffect(() => {
    if (!visible) return;
    setAccountId(initialAccountId ?? accounts[0]?.id ?? null);
    setAmount('');
    setReason(null);
    setClientKey(newClientKey());
    // Only when the sheet opens: a refetch of `accounts` must not reset the form.
  }, [visible, initialAccountId]);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const card = account?.kind === 'credit_card';
  const paise = parseRupeesToPaise(amount);
  const preview = account && paise !== null ? balanceDifference(account, paise, formatRupees) : null;
  const unchanged = preview?.diff === 0;
  // Money the bank shows less of than CUE: maybe a spend that was never logged.
  const offerExpense = reason === 'missed' && preview !== null && (card ? preview.diff > 0 : preview.diff < 0);
  const valid = account !== null && paise !== null && paise >= 0 && reason !== null && !unchanged;

  const submit = () => {
    if (!valid || account === null || paise === null || reason === null) return;
    const label = ADJUST_REASONS.find((r) => r.value === reason)?.label ?? 'Other';
    const today = toISODate(new Date());
    void run(
      () =>
        mutation.mutateAsync({
          id: account.id,
          today,
          client_key: clientKey,
          actual_paise: paise,
          reason: label,
          occurred_on: today,
        }),
      onClose,
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={reconcile ? 'Reconcile' : 'Update balance'}
      subtitle={
        reconcile
          ? `CUE shows ${account ? formatRupees(Math.abs(account.balance_paise ?? 0)) : '—'}${card ? ' due' : ''}. Enter what your statement says.`
          : 'Match CUE to what your bank shows.'
      }>
      <ChipRow
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={(id) => {
          setAccountId(id);
          setAmount('');
        }}
      />
      <TextField
        label={card ? 'Amount due the card shows' : 'Balance the bank shows'}
        value={amount}
        onChangeText={setAmount}
        prefix="₹"
        keyboardType="decimal-pad"
      />
      {preview ? (
        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{unchanged ? 'That matches what CUE shows.' : preview.text}</Text>
      ) : null}
      {!unchanged ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>What's the difference from?</Text>
          <ChipRow options={ADJUST_REASONS} value={reason} onChange={setReason} />
        </View>
      ) : null}
      {offerExpense ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>
            If you know what it was, adding it as an expense keeps your spending right.
          </Text>
          <SecondaryButton label="Add it as an expense instead" onPress={onAddExpense} />
        </View>
      ) : null}
      <FormError message={error} />
      <PrimaryButton
        label="Save adjustment"
        onPress={submit}
        disabled={!valid || mutation.isPending}
        loading={mutation.isPending}
      />
    </Sheet>
  );
}
