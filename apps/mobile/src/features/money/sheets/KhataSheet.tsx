import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';

import { defaultKhataAccount, khataAccounts, newClientKey } from '@/features/money/accounts';
import { ChipRow, PrimaryButton, SecondaryButton, TextField } from '@/features/money/components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '@/features/money/dates';
import { formatRupees, parseRupeesToPaise } from '@/features/money/format';
import { useAccounts, useAddKhata, useSummary, useToday } from '@/features/money/hooks';
import type { Direction } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'lent', label: 'I lent' },
  { value: 'borrowed', label: 'I borrowed' },
];

type When = 'today' | 'yesterday' | 'other';
const WHEN: { value: When; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

/**
 * Quick Add Lend and Borrow (spec section 5): amount, person, account and date
 * first; due date and notes behind More options. Saves a lend or borrow on the
 * ledger and the person's Khata record together.
 */
export function KhataSheet({
  visible,
  onClose,
  initialDirection = 'lent',
}: {
  visible: boolean;
  onClose: () => void;
  initialDirection?: Direction;
}) {
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [when, setWhen] = useState<When>('today');
  const [otherDate, setOtherDate] = useState('');
  const [dueText, setDueText] = useState('');
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (visible) setDirection(initialDirection);
  }, [visible, initialDirection]);
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  const mutation = useAddKhata();
  const summary = useSummary(visible).data;
  const balance = summary?.balance_paise ?? null;
  const owedAlready = summary?.you_owe_paise ?? 0;
  const { run, error } = useGuardedSubmit(visible);
  // Account chip (spec P0): where the money left or arrived. Defaults to Cash.
  const accounts = useAccounts(toISODate(useToday()), visible).data ?? [];
  const offered = khataAccounts(accounts);
  const [picked, setPicked] = useState<string | null>(null);
  const accountId = offered.some((a) => a.id === picked) ? picked : defaultKhataAccount(accounts);
  // One key per entry: a retried save returns the same entry instead of a second one.
  const [clientKey, setClientKey] = useState(newClientKey);

  const paise = parseRupeesToPaise(amount);
  const name = person.trim();
  const todayISO = toISODate(new Date());
  const occurredOn = when === 'today' ? todayISO : when === 'yesterday' ? daysBefore(new Date(), 1) : parseDisplayDate(otherDate);
  const dueOn = dueText.trim() ? parseDisplayDate(dueText) : null;
  const dateProblem = !occurredOn
    ? 'Enter the date as DD/MM/YYYY.'
    : occurredOn > todayISO
      ? "This can't be in the future."
      : dueText.trim() && !dueOn
        ? 'Enter the due date as DD/MM/YYYY.'
        : null;
  const valid =
    name.length >= 1 && name.length <= 60 && paise !== null && paise > 0 && note.trim().length <= 120 && !dateProblem;

  // Only the display name is kept; any failure falls back to typing the name.
  const pickContact = async () => {
    setContactsNote(null);
    try {
      if (Platform.OS === 'web') throw new Error('web');
      const { granted } = await requestPermissionsAsync();
      if (!granted) {
        setContactsNote('Contacts access is off. You can type the name instead.');
        return;
      }
      const contact = await Contact.presentPicker();
      const picked = contact ? (await contact.getFullName()).trim() : '';
      if (picked) setPerson(picked.slice(0, 60));
    } catch {
      setContactsNote('Contacts are not available here. You can type the name instead.');
    }
  };

  const submit = () => {
    if (!valid || paise === null) return;
    // Owing more in total than you hold is worth a second look; lending isn't.
    const owedTotal = owedAlready + paise;
    if (direction === 'borrowed' && balance !== null && owedTotal > balance) {
      Alert.alert(
        'Amount exceeds your balance',
        `Including this entry, the total you owe would be ${formatRupees(owedTotal)}, which is more than your current balance of ${formatRupees(balance)}. Please confirm the amount is correct before saving.`,
        [
          { text: 'Edit amount', style: 'cancel' },
          { text: 'Confirm and save', onPress: save },
        ],
      );
      return;
    }
    save();
  };

  const save = () => {
    if (!valid || paise === null) return;
    void run(
      () =>
        mutation.mutateAsync({
          direction,
          person: name,
          amount_paise: paise,
          note: note.trim() || null,
          client_key: clientKey,
          ...(accountId ? { account_id: accountId } : {}),
          ...(occurredOn ? { occurred_on: occurredOn } : {}),
          ...(dueOn ? { due_on: dueOn } : {}),
        }),
      () => {
        setDirection(initialDirection);
        setWhen('today');
        setOtherDate('');
        setDueText('');
        setMore(false);
        setPerson('');
        setAmount('');
        setNote('');
        setContactsNote(null);
        setPicked(null);
        setClientKey(newClientKey());
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={direction === 'lent' ? 'Lend' : 'Borrow'}>
      <ChipRow options={DIRECTIONS} value={direction} onChange={setDirection} />
      <TextField label="Person" value={person} onChangeText={setPerson} maxLength={60} />
      <SecondaryButton label="Pick from contacts" onPress={() => void pickContact()} />
      {contactsNote ? <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{contactsNote}</Text> : null}
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      {offered.length > 0 ? (
        <>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>
            {direction === 'lent' ? 'Paid from' : 'Received in'}
          </Text>
          <ChipRow
            options={offered.map((a) => ({ value: a.id, label: a.name }))}
            value={accountId}
            onChange={setPicked}
          />
        </>
      ) : null}
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>Date</Text>
      <ChipRow options={WHEN} value={when} onChange={setWhen} />
      {when === 'other' ? (
        <TextField
          label="Date (DD/MM/YYYY)"
          value={otherDate || toDisplayDate(todayISO)}
          onChangeText={setOtherDate}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      ) : null}
      {more ? (
        <>
          <TextField
            label="Due date (optional, DD/MM/YYYY)"
            value={dueText}
            onChangeText={setDueText}
            placeholder="DD/MM/YYYY"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} />
        </>
      ) : (
        <SecondaryButton label="More options" onPress={() => setMore(true)} />
      )}
      {dateProblem && (when === 'other' || dueText.trim()) ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.error }}>{dateProblem}</Text>
      ) : null}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
        {direction === 'lent'
          ? 'Money leaves your account and is owed back to you, so your net worth stays the same.'
          : 'Money arrives in your account and you owe it back, so your net worth stays the same.'}
      </Text>
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
