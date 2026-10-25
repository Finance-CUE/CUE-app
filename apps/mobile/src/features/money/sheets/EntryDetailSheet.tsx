import { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { PrimaryButton } from '@/features/money/components/ui';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

export function EntryDetailSheet({
  visible,
  onClose,
  title,
  lines,
  onDelete,
  onSettle,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  lines: string[];
  onDelete: () => Promise<void>;
  onSettle?: () => Promise<void>;
}) {
  const { run, error } = useGuardedSubmit(visible, 'Something went wrong. Please try again.');
  const [busy, setBusy] = useState(false);

  const act = (action: () => Promise<void>) => {
    setBusy(true);
    void run(action, onClose).finally(() => setBusy(false));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {lines.map((line) => (
        <Text key={line} style={{ fontSize: 15, color: COLORS.text }}>
          {line}
        </Text>
      ))}
      <FormError message={error} />
      {onSettle ? <PrimaryButton label="Mark settled" onPress={() => act(onSettle)} disabled={busy} loading={busy} /> : null}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy}
        onPress={() => act(onDelete)}
        activeOpacity={0.7}
        style={{
          height: 52,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: COLORS.error,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: busy ? 0.4 : 1,
        }}>
        <Text style={{ color: COLORS.error, fontSize: 16, fontWeight: '600' }}>Delete</Text>
      </TouchableOpacity>
    </Sheet>
  );
}
