import { useState } from 'react';

import { PrimaryButton, TextField } from '@/features/money/components/ui';
import { parseRupeesToPaise } from '@/features/money/format';
import { useAddAsset } from '@/features/money/hooks';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

export function AssetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const mutation = useAddAsset();
  const { run, error } = useGuardedSubmit(visible);

  const paise = parseRupeesToPaise(value);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 60 && paise !== null && paise > 0;

  const submit = () => {
    if (!valid || paise === null) return;
    void run(
      () => mutation.mutateAsync({ name: trimmed, value_paise: paise }),
      () => {
        setName('');
        setValue('');
        onClose();
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add an asset">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
      <TextField label="Current value" value={value} onChangeText={setValue} prefix="₹" keyboardType="decimal-pad" />
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
