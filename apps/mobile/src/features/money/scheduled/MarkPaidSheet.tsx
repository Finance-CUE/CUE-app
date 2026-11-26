import { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ChipRow, PrimaryButton, TextField } from '../components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { paiseToInput, parseRupeesToPaise } from '../format';
import { usePayScheduled } from '../hooks';
import { useRupees } from '../privacy';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { Account, LedgerTxn, Occurrence } from '../types';
import { dayMonth } from './model';

type When = 'today' | 'due' | 'other';

/**
 * Mark paid (spec 4.8): a short confirm with the amount (editable, for variable
 * bills), the account and the date (default today). Confirming records an
 * expense on that account; recurring income records income instead.
 */
export function MarkPaidSheet({
  occurrence: o,
  accounts,
  onClose,
  onPaid,
}: {
  occurrence: Occurrence | null;
  accounts: Account[];
  onClose: () => void;
  onPaid: (txn: LedgerTxn, o: Occurrence) => void;
}) {
  const formatRupees = useRupees();
  const visible = o !== null;
  const open = accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [when, setWhen] = useState<When>('today');
  const [otherDate, setOtherDate] = useState('');
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const pay = usePayScheduled();
  const { run, error } = useGuardedSubmit(visible);
  const todayISO = toISODate(new Date());

  useEffect(() => {
    if (!o) return;
    setAmount(paiseToInput(o.amount_paise));
    setAccountId(o.account_id && open.some((a) => a.id === o.account_id) ? o.account_id : (open[0]?.id ?? null));
    setWhen('today');
    setOtherDate(toDisplayDate(todayISO));
    setTried(false);
    setClientKey(newClientKey());
    // Only when a new due date opens the sheet.
  }, [o]);

  if (!o) return null;
  const income = o.kind === 'income';
  const paise = parseRupeesToPaise(amount);
  // Paying ahead of the due date is fine; a payment can't be dated in the future.
  const dueChoice = o.due_on <= todayISO && o.due_on !== todayISO;
  const date = when === 'today' ? todayISO : when === 'due' ? o.due_on : parseDisplayDate(otherDate);
  const errors = {
    amount: paise === null || paise <= 0 ? 'Enter an amount above ₹0.' : undefined,
    account: accountId ? undefined : 'Choose an account.',
    date: !date ? 'Enter the date as DD/MM/YYYY.' : date > todayISO ? "This can't be in the future." : undefined,
  };

  const save = () => {
    setTried(true);
    if (errors.amount || errors.account || errors.date || paise === null || !accountId || !date) return;
    void run(
      async () => {
        const txn = await pay.mutateAsync({
          id: o.schedule_id,
          today: todayISO,
          client_key: clientKey,
          due_on: o.due_on,
          amount_paise: paise,
          account_id: accountId,
          occurred_on: date,
        });
        onPaid(txn, o);
      },
      onClose,
    );
  };

  const options: { value: When; label: string }[] = [
    { value: 'today', label: 'Today' },
    ...(dueChoice ? [{ value: 'due' as const, label: `On ${dayMonth(o.due_on)}` }] : []),
    { value: 'other', label: 'Another day' },
  ];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={income ? `Did ${o.name} arrive?` : `Mark ${o.name} paid`}
      subtitle={`Due ${dayMonth(o.due_on)} · ${formatRupees(o.amount_paise)}`}
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label={income ? 'Mark received' : 'Mark paid'} onPress={save} disabled={pay.isPending} loading={pay.isPending} />
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.muted }}>Cancel</Text>
          </TouchableOpacity>
        </>
      }>
      <TextField
        label={o.variable ? 'Amount this time' : 'Amount'}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        prefix="₹"
      />
      <FieldError message={tried ? errors.amount : undefined} />
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>
        {income ? 'Received in' : 'Paid from'}
      </Text>
      <ChipRow options={open.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
      <FieldError message={tried ? errors.account : undefined} />
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>Date</Text>
      <ChipRow options={options} value={when} onChange={setWhen} />
      {when === 'other' ? (
        <TextField
          label="Date (DD/MM/YYYY)"
          value={otherDate}
          onChangeText={setOtherDate}
          placeholder={toDisplayDate(daysBefore(new Date(), 1))}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      ) : null}
      <FieldError message={tried ? errors.date : undefined} />
    </Sheet>
  );
}
