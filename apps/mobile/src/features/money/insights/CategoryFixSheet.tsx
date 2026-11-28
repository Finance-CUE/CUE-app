import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { toErrorMessage } from '@/lib/api';
import { ChipRow } from '../components/ui';
import { useFixCategory } from '../hooks';
import { categoryName, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../quickAdd/model';
import { FormError, Sheet } from '../sheets/Sheet';
import type { LedgerTxn } from '../types';
import { merchantOf } from './merchant';

/**
 * Long-press a row to fix its category (suggestion 18). After the change CUE asks
 * "Always put Zepto in Groceries?"; Yes remembers it for that merchant, so the
 * next Zepto entry gets it without asking.
 */
export function CategoryFixSheet({ txn, onClose, onDone }: { txn: LedgerTxn | null; onClose: () => void; onDone: (text: string) => void }) {
  const fix = useFixCategory();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [txn]);
  if (!txn) return null;
  const options = txn.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const merchant = merchantOf(txn.description);

  const save = async (category: string, remember: boolean) => {
    try {
      await fix.mutateAsync({ id: txn.id, category, remember });
    } catch (err) {
      setError(toErrorMessage(err, "Couldn't change it. Please try again."));
      return;
    }
    onClose();
    onDone(remember && merchant ? `${merchant.label} will go in ${categoryName(category)} from now on` : `Moved to ${categoryName(category)}`);
  };

  const pick = (category: string) => {
    if (category === txn.category) return onClose();
    if (!merchant) return void save(category, false);
    Alert.alert(`Always put ${merchant.label} in ${categoryName(category)}?`, 'CUE will use it for new entries from them.', [
      { text: 'Just this one', onPress: () => void save(category, false) },
      { text: 'Always', onPress: () => void save(category, true) },
    ]);
  };

  return (
    <Sheet visible onClose={onClose} title="Change category" subtitle={txn.description ?? categoryName(txn.category)}>
      <ChipRow options={[...options]} value={txn.category} onChange={pick} />
      <FormError message={error} />
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
        The amount, account and date stay the same.
      </Text>
    </Sheet>
  );
}
