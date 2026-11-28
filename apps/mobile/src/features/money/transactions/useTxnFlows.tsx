import { type Href, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { Toast, type ToastMessage } from '../components/Toast';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { formatDate, formatDateTime } from '../dates';
import { useDeleteTransaction, useRestoreTransaction } from '../hooks';
import { useRupees } from '../privacy';
import { categoryName, savedLabel, scheduledLabel } from '../quickAdd/model';
import { type QuickAddChoice, QuickAddSheet, type Saved, type Seed } from '../quickAdd/QuickAddSheet';
import { FormError, Sheet } from '../sheets/Sheet';
import { UpdateBalanceSheet } from '../sheets/UpdateBalanceSheet';
import { CategoryFixSheet } from '../insights/CategoryFixSheet';
import type { Account, LedgerTxn } from '../types';
import { canDuplicate, deleteQuestion, isDeletable, isEditable, rowFor } from './model';

type Open =
  | { name: 'quick'; kind: QuickAddChoice; account: string | null; seed: Seed | null }
  | { name: 'detail'; txn: LedgerTxn }
  | { name: 'balance'; account: string | null; reconcile: boolean }
  | { name: 'category'; txn: LedgerTxn }
  | null;

/**
 * Everything that opens from a transaction or from Quick Add, shared by Today
 * and Transaction history: the detail sheet (Edit, Duplicate, Delete), the
 * Quick Add form, Update balance and the Undo toast. Render `elements` once.
 */
export function useTxnFlows({
  accounts,
  defaultDate,
  onLendBorrow,
  onGroupExpense,
  onSettlement,
  onAsk,
  onSubscription = () => {},
  onGoalJar,
}: {
  accounts: Account[];
  defaultDate: string;
  onLendBorrow?: (direction: 'lent' | 'borrowed') => void;
  onGroupExpense?: () => void;
  onSettlement?: () => void;
  onAsk?: () => void;
  onSubscription?: () => void;
  onGoalJar?: () => void;
}) {
  const formatRupees = useRupees();
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const del = useDeleteTransaction();
  const restore = useRestoreTransaction();
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const close = () => setOpen(null);

  const openQuick = (kind: QuickAddChoice, account: string | null = null) =>
    setOpen({ name: 'quick', kind, account, seed: null });
  const openTxn = (txn: LedgerTxn) => {
    // A group row is changed in its group: the expense editor opens there.
    if (txn.group_id) {
      router.push(
        (txn.group_expense_id ? `/group/${txn.group_id}?expense=${txn.group_expense_id}` : `/group/${txn.group_id}`) as Href,
      );
      return;
    }
    setDeleteError(null);
    setOpen({ name: 'detail', txn });
  };
  const openBalance = (account: string | null, reconcile = false) => setOpen({ name: 'balance', account, reconcile });

  // "Expense saved · Undo", plus the low-balance note when an account went below ₹0.
  const onSaved = ({ txn, kind, lowNote, accountId, edited, scheduledFor }: Saved) => {
    if (!txn) {
      // A future date became a scheduled payment: nothing was spent, so there is nothing to undo here.
      setToast({ id: `scheduled:${Date.now()}`, text: `${scheduledLabel(scheduledFor ?? '')} · see Coming up` });
      return;
    }
    setToast({
      id: `${txn.id}:${Date.now()}`,
      text: edited ? `${savedLabel(kind).replace('saved', 'updated')}` : savedLabel(kind),
      ...(edited ? {} : { action: { label: 'Undo', onPress: () => void del.mutateAsync(txn.id).catch(() => undefined) } }),
      ...(lowNote ? { note: { text: lowNote, action: { label: 'Update', onPress: () => openBalance(accountId) } } } : {}),
    });
  };

  // Delete asks first; afterwards a 5-second Undo brings it back.
  const confirmDelete = (txn: LedgerTxn) =>
    Alert.alert('Delete this entry?', deleteQuestion(txn, byId, formatRupees), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await del.mutateAsync(txn.id);
          } catch {
            setDeleteError("Couldn't delete this entry. Please try again.");
            return;
          }
          close();
          setToast({
            id: `${txn.id}:deleted:${Date.now()}`,
            text: 'Deleted',
            action: { label: 'Undo', onPress: () => void restore.mutateAsync(txn.id).catch(() => undefined) },
          });
        },
      },
    ]);

  const detail = open?.name === 'detail' ? open.txn : null;
  const quick = open?.name === 'quick' ? open : null;
  const elements = (
    <>
      <QuickAddSheet
        visible={quick !== null}
        initial={quick?.kind ?? null}
        presetAccountId={quick?.account ?? null}
        seed={quick?.seed ?? null}
        accounts={accounts}
        defaultDate={defaultDate}
        onClose={close}
        onSaved={onSaved}
        onLendBorrow={
          onLendBorrow
            ? (direction) => {
                close();
                onLendBorrow(direction);
              }
            : undefined
        }
        onGroupExpense={
          onGroupExpense
            ? () => {
                close();
                onGroupExpense();
              }
            : undefined
        }
        onAsk={
          onAsk
            ? () => {
                close();
                onAsk();
              }
            : undefined
        }
        onSettlement={
          onSettlement
            ? () => {
                close();
                onSettlement();
              }
            : undefined
        }
        onGoalJar={
          onGoalJar
            ? () => {
                close();
                onGoalJar();
              }
            : undefined
        }
        onSubscription={() => {
          close();
          onSubscription();
        }}
      />
      <TransactionSheet
        txn={detail}
        accounts={byId}
        error={deleteError}
        deleting={del.isPending}
        onClose={close}
        onEdit={(txn) => setOpen({ name: 'quick', kind: null, account: null, seed: { mode: 'edit', txn } })}
        onDuplicate={(txn) => setOpen({ name: 'quick', kind: null, account: null, seed: { mode: 'duplicate', txn } })}
        onDelete={confirmDelete}
      />
      <UpdateBalanceSheet
        visible={open?.name === 'balance'}
        onClose={close}
        accounts={accounts}
        initialAccountId={open?.name === 'balance' ? open.account : null}
        reconcile={open?.name === 'balance' && open.reconcile}
        onAddExpense={() => openQuick('expense', open?.name === 'balance' ? open.account : null)}
      />
      <CategoryFixSheet
        txn={open?.name === 'category' ? open.txn : null}
        onClose={close}
        onDone={(text) => setToast({ id: `category:${Date.now()}`, text })}
      />
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
  /** Long-press a row: change its category, and maybe remember it for the merchant. */
  const fixCategory = (txn: LedgerTxn) => setOpen({ name: 'category', txn });
  /** Ask CUE's filled form: Quick Add opens with it, waiting for Save. */
  const openDraft = (txn: LedgerTxn) => setOpen({ name: 'quick', kind: null, account: null, seed: { mode: 'draft', txn } });
  return { openQuick, openTxn, openBalance, openDraft, fixCategory, anyOpen: open !== null, elements };
}

/** Spec 4.9: complete details, then Edit, Duplicate and Delete. */
function TransactionSheet({
  txn,
  accounts,
  error,
  deleting,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  txn: LedgerTxn | null;
  accounts: Map<string, Account>;
  error: string | null;
  deleting: boolean;
  onClose: () => void;
  onEdit: (t: LedgerTxn) => void;
  onDuplicate: (t: LedgerTxn) => void;
  onDelete: (t: LedgerTxn) => void;
}) {
  const formatRupees = useRupees();
  if (!txn) return null;
  const row = rowFor(txn, accounts, formatRupees);
  const name = (id: string | null) => (id ? (accounts.get(id)?.name ?? 'An archived account') : null);
  const lines: [string, string | null][] = [
    ['Amount', formatRupees(Math.abs(txn.amount_paise))],
    ['Category', txn.category ? categoryName(txn.category) : null],
    [txn.type === 'transfer' ? 'From' : 'Account', name(txn.account_id) ?? (txn.type === 'transfer' ? null : 'No account')],
    ['To', txn.type === 'transfer' ? name(txn.to_account_id) : null],
    ['Date', formatDate(txn.occurred_on)],
    ['Reason', txn.reason],
    ['Notes', txn.note],
    ['Logged', formatDateTime(txn.created_at)],
  ];
  const khata = ['lend', 'borrow', 'repayment_received', 'repayment_made'].includes(txn.type);
  return (
    <Sheet visible onClose={onClose} title={row.title} subtitle={row.amount}>
      <View style={{ gap: 10 }}>
        {lines
          .filter((l): l is [string, string] => Boolean(l[1]))
          .map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.muted }}>{label}</Text>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
            </View>
          ))}
      </View>
      {khata ? (
        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>Lending, borrowing and paying back are changed in Khata.</Text>
      ) : null}
      {txn.type === 'opening' ? (
        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>
          To correct an opening balance, use Update balance. History is never rewritten.
        </Text>
      ) : null}
      <FormError message={error} />
      {isEditable(txn) ? <PrimaryButton label="Edit" onPress={() => onEdit(txn)} /> : null}
      {canDuplicate(txn) ? <SecondaryButton label="Duplicate" onPress={() => onDuplicate(txn)} /> : null}
      {isDeletable(txn) ? (
        <Text
          accessibilityRole="button"
          onPress={deleting ? undefined : () => onDelete(txn)}
          style={{ fontFamily: FONT.semibold, textAlign: 'center', fontSize: 15, color: COLORS.error, paddingVertical: 12 }}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Text>
      ) : null}
    </Sheet>
  );
}
