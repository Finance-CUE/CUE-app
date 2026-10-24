import { useState } from 'react';

import { ChipRow, PrimaryButton, TextField } from '@/features/money/components/ui';
import { parseRupeesToPaise } from '@/features/money/format';
import { useAddKhata } from '@/features/money/hooks';
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
  const mutation = useAddKhata();
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(amount);
  const name = person.trim();
  const valid = name.length >= 1 && name.length <= 60 && paise !== null && paise > 0 && note.trim().length <= 120;

  const submit = () => {
    if (!valid || paise === null) return;
    void run(
      () => mutation.mutateAsync({ direction, person: name, amount_paise: paise, note: note.trim() || null }),
      () => {
        setDirection('lent');
        setPerson('');
        setAmount('');
        setNote('');
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Lend / Borrow">
      <ChipRow options={DIRECTIONS} value={direction} onChange={setDirection} />
      <TextField label="Person" value={person} onChangeText={setPerson} maxLength={60} />
      <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" keyboardType="decimal-pad" />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} />
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
