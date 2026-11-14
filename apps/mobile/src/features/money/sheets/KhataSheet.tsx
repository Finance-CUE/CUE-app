import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { useState } from 'react';
import { Alert, Platform, Text } from 'react-native';

import { COLORS } from '@/features/assessment/theme';

import { ChipRow, PrimaryButton, SecondaryButton, TextField } from '@/features/money/components/ui';
import { formatRupees, parseRupeesToPaise } from '@/features/money/format';
import { useAddKhata, useSummary } from '@/features/money/hooks';
import type { Direction } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'lent', label: 'I lent' },
  { value: 'borrowed', label: 'I borrowed' },
];

export function KhataSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<Direction>('lent');
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  const mutation = useAddKhata();
  const summary = useSummary(visible).data;
  const balance = summary?.balance_paise ?? null;
  const owedAlready = summary?.you_owe_paise ?? 0;
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(amount);
  const name = person.trim();
  const valid = name.length >= 1 && name.length <= 60 && paise !== null && paise > 0 && note.trim().length <= 120;

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
      () => mutation.mutateAsync({ direction, person: name, amount_paise: paise, note: note.trim() || null }),
      () => {
        setDirection('lent');
        setPerson('');
        setAmount('');
        setNote('');
        setContactsNote(null);
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Lend / Borrow">
      <ChipRow options={DIRECTIONS} value={direction} onChange={setDirection} />
      <TextField label="Person" value={person} onChangeText={setPerson} maxLength={60} />
      <SecondaryButton label="Pick from contacts" onPress={() => void pickContact()} />
      {contactsNote ? <Text style={{ fontSize: 13, color: COLORS.muted }}>{contactsNote}</Text> : null}
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} />
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
