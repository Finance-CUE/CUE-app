import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ChipRow, PrimaryButton, TextField } from '../components/ui';
import { toISODate } from '../dates';
import { parseRupeesToPaise } from '../format';
import { useMoveJar } from '../hooks';
import { useRupees } from '../privacy';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { Account, Jar, JarMove } from '../types';

export type MoveMode = 'add' | 'withdraw';

/**
 * Add money or Withdraw (spec 4.7), and Quick Add's Goal Jar tile (with a jar
 * picker). Only the allocation moves: the balance and net worth stay the same,
 * and a withdrawal is never income. A jar can't take more than its account's
 * free balance.
 */
export function MoveSheet({
  visible,
  mode,
  jar,
  jars,
  accounts,
  onClose,
  onMoved,
  onNewJar,
}: {
  visible: boolean;
  mode: MoveMode;
  /** The jar; null shows a picker (Quick Add). */
  jar: Jar | null;
  jars: Jar[];
  accounts: Account[];
  onClose: () => void;
  onMoved: (move: JarMove, jar: Jar, mode: MoveMode) => void;
  /** Quick Add: "+ New jar" opens Create jar. */
  onNewJar?: () => void;
}) {
  const formatRupees = useRupees();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const moveJar = useMoveJar();
  const { run, error } = useGuardedSubmit(visible);
  const todayISO = toISODate(new Date());
  const open = jars.filter((j) => j.status !== 'archived');

  useEffect(() => {
    if (!visible) return;
    setPickedId(jar?.id ?? open[0]?.id ?? null);
    setAmount('');
    setNote('');
    setTried(false);
    setClientKey(newClientKey());
    // Only when the sheet opens.
  }, [visible, jar]);

  const target = jar ?? open.find((j) => j.id === pickedId) ?? null;
  const account = target ? accounts.find((a) => a.id === target.account_id) : undefined;
  const free = account ? (account.free_paise ?? account.balance_paise ?? 0) : 0;
  const paise = parseRupeesToPaise(amount);
  const limit = mode === 'add' ? free : (target?.saved_paise ?? 0);
  const problem = !target
    ? 'Choose a jar.'
    : paise === null || paise <= 0
      ? 'Enter an amount above ₹0.'
      : paise > limit
        ? mode === 'add'
          ? `${account?.name ?? 'This account'} has only ${formatRupees(Math.max(free, 0))} free.`
          : `The jar holds ${formatRupees(target.saved_paise)}.`
        : null;

  const save = () => {
    setTried(true);
    if (problem || !target || paise === null) return;
    void run(
      async () => {
        const move = await moveJar.mutateAsync({
          id: target.id,
          action: mode,
          today: todayISO,
          client_key: clientKey,
          amount_paise: paise,
          occurred_on: todayISO,
          note: note.trim() || null,
        });
        onMoved(move, target, mode);
      },
      onClose,
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={mode === 'add' ? (target ? `Add to ${target.name}` : 'Add to a jar') : `Withdraw from ${target?.name ?? 'jar'}`}
      subtitle={
        target
          ? mode === 'add'
            ? `${formatRupees(Math.max(free, 0))} free in ${account?.name ?? 'the account'}`
            : `${formatRupees(target.saved_paise)} in the jar`
          : undefined
      }
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label={mode === 'add' ? 'Add money' : 'Withdraw'} onPress={save} disabled={moveJar.isPending} loading={moveJar.isPending} />
        </>
      }>
      {!jar ? (
        <>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>Jar</Text>
          <ChipRow
            options={[
              ...open.map((j) => ({ value: j.id, label: `${j.icon} ${j.name}` })),
              ...(onNewJar ? [{ value: '__new', label: '+ New jar' }] : []),
            ]}
            value={pickedId}
            onChange={(v) => (v === '__new' ? onNewJar?.() : setPickedId(v))}
          />
        </>
      ) : null}
      <TextField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="₹" placeholder="0" />
      <FieldError message={tried ? problem : undefined} />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} />
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
        {mode === 'add'
          ? 'Your bank balance and net worth stay the same. The money is only set aside.'
          : 'The money goes back to your free balance. A withdrawal is never income.'}
      </Text>
    </Sheet>
  );
}
