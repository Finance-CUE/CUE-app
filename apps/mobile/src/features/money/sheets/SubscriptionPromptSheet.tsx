import { Text, View } from 'react-native';

import { COLORS } from '@/features/assessment/theme';
import { PrimaryButton, SecondaryButton } from '@/features/money/components/ui';
import { formatDate, parseISODate } from '@/features/money/dates';
import { formatRupees } from '@/features/money/format';
import { useAnswerCycle } from '@/features/money/hooks';
import type { DueCycle } from '@/features/money/types';
import { FormError, Sheet, useGuardedSubmit } from './Sheet';

/** Asks about the first due cycle; answering refreshes the list, so the next one shows. */
export function SubscriptionPromptSheet({
  due,
  currentMonth,
  onClose,
}: {
  due: DueCycle[];
  /** YYYY-MM-01 of the current month. */
  currentMonth: string;
  onClose: () => void;
}) {
  const cycle = due[0];
  const mutation = useAnswerCycle();
  const { run, error } = useGuardedSubmit(!!cycle);
  const pending = mutation.isPending;

  const answer = (active: boolean) => {
    if (!cycle) return;
    void run(
      () => mutation.mutateAsync({ id: cycle.subscription_id, month: cycle.month, active }),
      () => {},
    );
  };

  const amount = cycle ? formatRupees(cycle.amount_paise) : '';
  const subtitle = !cycle
    ? undefined
    : cycle.month === currentMonth
      ? `${amount} · billed ${formatDate(cycle.billing_on)}`
      : `${amount} for ${parseISODate(cycle.month).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`;

  return (
    <Sheet visible={!!cycle} onClose={onClose} title={cycle ? `Is ${cycle.name} still active?` : ''} subtitle={subtitle}>
      <Text style={{ fontSize: 14, color: COLORS.muted }}>Yes logs this payment. No stops tracking it.</Text>
      <FormError message={error} />
      <PrimaryButton label="Yes" onPress={() => answer(true)} disabled={pending} loading={pending} />
      <View pointerEvents={pending ? 'none' : 'auto'} style={{ opacity: pending ? 0.4 : 1 }}>
        <SecondaryButton label="No" onPress={() => answer(false)} />
      </View>
    </Sheet>
  );
}
