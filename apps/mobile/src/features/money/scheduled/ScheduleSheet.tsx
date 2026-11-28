import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';

import { COLORS, FONT, useDashboardTheme } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ChipRow, PrimaryButton, TextField } from '../components/ui';
import { parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { paiseToInput, parseRupeesToPaise } from '../format';
import { useAddScheduled, useUpdateScheduled } from '../hooks';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../quickAdd/model';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { Account, Frequency, Schedule, ScheduleKind } from '../types';
import { defaultCategory, FREQUENCIES, KINDS, validateSchedule } from './model';

const SAVE_ERROR = 'Not saved. Check your connection and try again.';

/**
 * Quick Add's Subscription tile, and Edit on a scheduled item (spec 4.8 and the
 * Quick Add table): name, amount, billing frequency, next billing date and
 * account; reminder and variable amount behind More options. It is a schedule,
 * not a transaction: nothing is spent until it is marked paid.
 */
export function ScheduleSheet({
  visible,
  item,
  income = false,
  accounts,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Edit this item; null adds a new one. */
  item: Schedule | null;
  /** Add recurring income (salary) instead of a payment. */
  income?: boolean;
  accounts: Account[];
  onClose: () => void;
  onSaved: (name: string, edited: boolean) => void;
}) {
  const theme = useDashboardTheme();
  const open = accounts.filter((a) => !a.archived);
  const [kind, setKind] = useState<ScheduleKind>('subscription');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextText, setNextText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [reminder, setReminder] = useState(true);
  const [variable, setVariable] = useState(false);
  const [more, setMore] = useState(false);
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const add = useAddScheduled();
  const update = useUpdateScheduled();
  const pending = add.isPending || update.isPending;
  const { run, error } = useGuardedSubmit(visible, SAVE_ERROR);
  const todayISO = toISODate(new Date());

  useEffect(() => {
    if (!visible) return;
    const startKind: ScheduleKind = item?.kind ?? (income ? 'income' : 'subscription');
    setKind(startKind);
    setName(item?.name ?? '');
    setAmount(item ? paiseToInput(item.amount_paise) : '');
    setFrequency(item?.frequency ?? 'monthly');
    setNextText(item?.next_due_on ? toDisplayDate(item.next_due_on) : '');
    setAccountId(item?.account_id ?? open.find((a) => a.kind !== 'credit_card')?.id ?? open[0]?.id ?? null);
    setCategory(item?.category ?? (startKind === 'income' ? 'salary' : null));
    setReminder(item?.reminder ?? true);
    setVariable(item?.variable ?? false);
    setMore(Boolean(item && (item.variable || !item.reminder)));
    setTried(false);
    setClientKey(newClientKey());
    // Only when the sheet opens: a refetch must not reset what is being typed.
  }, [visible, item, income]);

  const paise = parseRupeesToPaise(amount);
  const nextOn = parseDisplayDate(nextText);
  const errors = validateSchedule({ name, amountPaise: paise, nextOn, accountId });
  const show = (f: keyof typeof errors) => (tried ? errors[f] : undefined);
  const isIncome = kind === 'income';

  const close = () => {
    if (!item && (name.trim() || amount.trim()) && !pending) {
      Alert.alert('Discard this entry?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length > 0 || paise === null || !nextOn || !accountId) return;
    const input = {
      kind,
      name: name.trim(),
      amount_paise: paise,
      frequency,
      next_on: nextOn,
      account_id: accountId,
      category: category ?? (isIncome ? 'other' : defaultCategory(kind)),
      variable,
      reminder,
    };
    void run(
      async () => {
        if (item) await update.mutateAsync({ id: item.id, today: todayISO, ...input });
        else await add.mutateAsync({ client_key: clientKey, today: todayISO, ...input });
      },
      () => {
        onSaved(input.name, Boolean(item));
        onClose();
      },
    );
  };

  const title = item ? `Edit ${item.name}` : isIncome ? 'Recurring income' : 'Subscription or bill';
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title}
      subtitle={isIncome ? 'CUE expects it on this date and asks you to confirm it arrived.' : 'Shows in Coming up. Nothing is spent until you mark it paid.'}
      tall
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label="Save" onPress={save} disabled={pending} loading={pending} />
          <TouchableOpacity accessibilityRole="button" onPress={close} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.muted }}>Cancel</Text>
          </TouchableOpacity>
        </>
      }>
      {!isIncome ? (
        <>
          <Label>Type</Label>
          <ChipRow options={KINDS} value={kind} onChange={(k) => setKind(k)} />
        </>
      ) : null}
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder={isIncome ? 'Salary' : kind === 'rent' ? 'Rent' : kind === 'bill' ? 'Electricity' : 'Netflix'}
        maxLength={60}
      />
      <FieldError message={show('name')} />
      <TextField
        label={variable ? 'Usual amount' : 'Amount'}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        prefix="₹"
        placeholder="0"
      />
      <FieldError message={show('amount')} />
      <Label>How often</Label>
      <ChipRow options={isIncome ? FREQUENCIES.filter((f) => f.value !== 'once') : FREQUENCIES} value={frequency} onChange={setFrequency} />
      <TextField
        label={isIncome ? 'Next expected (DD/MM/YYYY)' : frequency === 'once' ? 'Due on (DD/MM/YYYY)' : 'Next due (DD/MM/YYYY)'}
        value={nextText}
        onChangeText={setNextText}
        placeholder="DD/MM/YYYY"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <FieldError message={show('date')} />
      <Label>{isIncome ? 'Paid into' : 'Paid from'}</Label>
      <ChipRow options={open.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
      <FieldError message={show('account')} />
      <Label>Category</Label>
      <ChipRow
        options={[...(isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)]}
        value={category ?? (isIncome ? 'salary' : defaultCategory(kind))}
        onChange={setCategory}
      />

      {more ? (
        <>
          <Label>Reminder</Label>
          <ChipRow
            options={[
              { value: 'on', label: 'Remind me' },
              { value: 'off', label: 'No reminder' },
            ]}
            value={reminder ? 'on' : 'off'}
            onChange={(v) => setReminder(v === 'on')}
          />
          <Label>Amount each time</Label>
          <ChipRow
            options={[
              { value: 'fixed', label: 'Fixed' },
              { value: 'variable', label: 'Varies' },
            ]}
            value={variable ? 'variable' : 'fixed'}
            onChange={(v) => setVariable(v === 'variable')}
          />
        </>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => setMore(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: theme.accentText }}>More options</Text>
        </TouchableOpacity>
      )}
    </Sheet>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>{children}</Text>;
}
