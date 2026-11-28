import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { type Bank, bankBySlug } from '@/features/money/banks';
import { PrimaryButton, TextField } from '@/features/money/components/ui';
import { toISODate } from '@/features/money/dates';
import { useUpdateAccount } from '@/features/money/hooks';
import { kindLabel } from '@/features/money/today/model';
import type { Account } from '@/features/money/types';
import { BankPicker } from './BankPicker';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

/**
 * Edit account: nickname and bank. The type stays: a card's balance means
 * money due, so changing it would rewrite what the history says.
 */
export function EditAccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);
  const mutation = useUpdateAccount();
  const visible = account !== null;
  const { run, error } = useGuardedSubmit(visible);

  useEffect(() => {
    if (!account) return;
    setName(account.name);
    setBank(bankBySlug(account.bank) ?? null);
  }, [account]);

  if (!account) return null;
  const nickname = name.trim();
  const valid = nickname.length >= 1 && nickname.length <= 40;
  const submit = () => {
    if (!valid) return;
    void run(
      () =>
        mutation.mutateAsync({
          id: account.id,
          today: toISODate(new Date()),
          name: nickname,
          bank: bank && bank.slug !== 'other' ? bank.slug : null,
        }),
      onClose,
    );
  };

  return (
    <Sheet visible onClose={onClose} title="Edit account" subtitle={kindLabel(account.kind)}>
      <TextField label="Nickname" value={name} onChangeText={setName} maxLength={40} />
      {account.kind === 'cash' ? null : <BankPicker value={bank?.slug ?? null} onChange={setBank} />}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        The account type can't change. To correct the balance, use Update balance.
      </Text>
      <FormError message={error} />
      <PrimaryButton label="Save" onPress={submit} disabled={!valid || mutation.isPending} loading={mutation.isPending} />
    </Sheet>
  );
}
