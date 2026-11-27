import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { toErrorMessage } from '@/lib/api';
import { Toast, type ToastMessage } from '../components/Toast';
import { useGroups, useKhata, useSetGroupEntryDeleted } from '../hooks';
import { personBalances } from '../khata';
import { KhataSheet } from '../sheets/KhataSheet';
import type { Account, Direction, GroupDetail, GroupExpense } from '../types';
import { GroupExpenseSheet } from './GroupExpenseSheet';
import { GroupFormSheet } from './GroupFormSheet';
import { SettlementSheet, type SettlementPreset } from './SettlementSheet';

type Open =
  | { name: 'khata'; direction: Direction }
  | { name: 'expense'; groupId: string | null; expense: GroupExpense | null }
  | { name: 'settle'; preset: SettlementPreset | null }
  | { name: 'group'; detail: GroupDetail | null }
  | null;

/**
 * Shared money's sheets (spec P3), used by Quick Add, Khata and the group
 * screen: Lend, Borrow, Group Expense, Settlement and New / Edit group, with a
 * 5-second Undo after deleting a group expense. One sheet at a time. Render
 * `elements` once, outside any scroll view.
 */
export function useSharedFlows({ accounts, onGroupCreated }: { accounts: Account[]; onGroupCreated?: (id: string) => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const groups = useGroups().data?.groups ?? [];
  const people = personBalances(useKhata().data ?? []);
  const setDeleted = useSetGroupEntryDeleted();
  const close = () => setOpen(null);
  const done = (text: string) => setToast({ id: `shared:${Date.now()}`, text });

  const deleteExpense = (e: GroupExpense) =>
    Alert.alert(`Delete ${e.description}?`, 'Everyone\'s balance in the group will update.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await setDeleted.mutateAsync({ kind: 'expenses', id: e.id, deleted: true });
          } catch (err) {
            done(toErrorMessage(err, "Couldn't delete it. Please try again."));
            return;
          }
          close();
          setToast({
            id: `gx-del:${e.id}:${Date.now()}`,
            text: 'Deleted',
            action: { label: 'Undo', onPress: () => void setDeleted.mutateAsync({ kind: 'expenses', id: e.id, deleted: false }).catch(() => undefined) },
          });
        },
      },
    ]);

  const elements = (
    <>
      <KhataSheet visible={open?.name === 'khata'} initialDirection={open?.name === 'khata' ? open.direction : 'lent'} onClose={close} />
      <GroupExpenseSheet
        visible={open?.name === 'expense'}
        groupId={open?.name === 'expense' ? open.groupId : null}
        expense={open?.name === 'expense' ? open.expense : null}
        groups={groups}
        accounts={accounts}
        onClose={close}
        onSaved={done}
        onDelete={deleteExpense}
      />
      <SettlementSheet
        visible={open?.name === 'settle'}
        preset={open?.name === 'settle' ? open.preset : null}
        people={people}
        groups={groups}
        accounts={accounts}
        onClose={close}
        onDone={done}
      />
      <GroupFormSheet
        visible={open?.name === 'group'}
        detail={open?.name === 'group' ? open.detail : null}
        onClose={close}
        onSaved={(text, id) => {
          done(text);
          if (open?.name === 'group' && !open.detail) onGroupCreated?.(id);
        }}
      />
      <Toast toast={toast} onDone={clearToast} />
    </>
  );

  return {
    openLend: (direction: Direction = 'lent') => setOpen({ name: 'khata', direction }),
    openGroupExpense: (groupId: string | null = null, expense: GroupExpense | null = null) => setOpen({ name: 'expense', groupId, expense }),
    openSettlement: (preset: SettlementPreset | null = null) => setOpen({ name: 'settle', preset }),
    openGroupForm: (detail: GroupDetail | null = null) => setOpen({ name: 'group', detail }),
    deleteSettlement: async (id: string) => {
      try {
        await setDeleted.mutateAsync({ kind: 'settlements', id, deleted: true });
      } catch (err) {
        done(toErrorMessage(err, "Couldn't delete it. Please try again."));
        return;
      }
      setToast({
        id: `gs-del:${id}:${Date.now()}`,
        text: 'Settlement deleted',
        action: { label: 'Undo', onPress: () => void setDeleted.mutateAsync({ kind: 'settlements', id, deleted: false }).catch(() => undefined) },
      });
    },
    hasGroups: groups.length > 0,
    anyOpen: open !== null,
    elements,
  };
}
