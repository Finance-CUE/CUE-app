import { useCallback, useMemo, useState } from 'react';

import { Toast, type ToastMessage } from '../components/Toast';
import { toISODate } from '../dates';
import { useCancelScheduled, useDeleteTransaction, useScheduled, useSkipScheduled, useUnskipScheduled } from '../hooks';
import { toErrorMessage } from '@/lib/api';
import type { Account, Occurrence, Schedule } from '../types';
import { CalendarSheet } from './CalendarSheet';
import { DueDetailSheet } from './DueDetailSheet';
import { MarkPaidSheet } from './MarkPaidSheet';
import { dayMonth } from './model';
import { ScheduleSheet } from './ScheduleSheet';

type Open =
  | { name: 'detail'; o: Occurrence }
  | { name: 'pay'; o: Occurrence }
  | { name: 'form'; item: Schedule | null; income: boolean }
  | { name: 'calendar' }
  | null;

/**
 * Everything Coming up opens (spec 4.8), shared by Today and the Upcoming dues
 * screen: the detail sheet, Mark paid, Skip, the add / edit form and the month
 * calendar, with a 5-second Undo after Mark paid or Skip. One sheet at a time
 * (iOS can't stack modals). Render `elements` once.
 */
export function useDueFlows({ accounts }: { accounts: Account[] }) {
  const todayISO = toISODate(new Date());
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const scheduled = useScheduled(todayISO);
  const skip = useSkipScheduled();
  const unskip = useUnskipScheduled();
  const cancel = useCancelScheduled();
  const del = useDeleteTransaction();
  const close = () => setOpen(null);

  const openDetail = (o: Occurrence) => {
    setError(null);
    setOpen({ name: 'detail', o });
  };
  const openPay = (o: Occurrence) => setOpen({ name: 'pay', o });
  const openAdd = (income = false) => setOpen({ name: 'form', item: null, income });
  const openCalendar = () => setOpen({ name: 'calendar' });
  const openEdit = (o: Occurrence) => {
    const item = (scheduled.data ?? []).find((s) => s.id === o.schedule_id) ?? null;
    if (item) setOpen({ name: 'form', item, income: item.kind === 'income' });
  };

  const doSkip = async (o: Occurrence) => {
    setError(null);
    try {
      await skip.mutateAsync({ id: o.schedule_id, due_on: o.due_on });
    } catch (err) {
      // Shown in the detail sheet when it is open; otherwise as a toast.
      const message = toErrorMessage(err, "Couldn't skip it. Please try again.");
      if (open?.name === 'detail') setError(message);
      else setToast({ id: `skip-error:${Date.now()}`, text: message });
      return;
    }
    close();
    setToast({
      id: `skip:${o.schedule_id}:${o.due_on}:${Date.now()}`,
      text: `Skipped ${o.name} for ${dayMonth(o.due_on)}`,
      action: { label: 'Undo', onPress: () => void unskip.mutateAsync({ id: o.schedule_id, due_on: o.due_on }).catch(() => undefined) },
    });
  };

  const doCancel = async (o: Occurrence) => {
    setError(null);
    try {
      await cancel.mutateAsync(o.schedule_id);
    } catch (err) {
      setError(toErrorMessage(err, "Couldn't cancel it. Please try again."));
      return;
    }
    close();
    setToast({ id: `cancel:${o.schedule_id}:${Date.now()}`, text: `${o.name} cancelled` });
  };

  const detail = open?.name === 'detail' ? open.o : null;
  const elements = (
    <>
      <DueDetailSheet
        occurrence={detail}
        accounts={byId}
        today={todayISO}
        error={error}
        busy={skip.isPending || cancel.isPending}
        onClose={close}
        onPay={openPay}
        onSkip={(o) => void doSkip(o)}
        onEdit={openEdit}
        onCancel={(o) => void doCancel(o)}
      />
      <MarkPaidSheet
        occurrence={open?.name === 'pay' ? open.o : null}
        accounts={accounts}
        onClose={close}
        onPaid={(txn, o) =>
          setToast({
            id: `paid:${txn.id}:${Date.now()}`,
            text: o.kind === 'income' ? `${o.name} received` : `${o.name} marked paid`,
            action: { label: 'Undo', onPress: () => void del.mutateAsync(txn.id).catch(() => undefined) },
          })
        }
      />
      <ScheduleSheet
        visible={open?.name === 'form'}
        item={open?.name === 'form' ? open.item : null}
        income={open?.name === 'form' ? open.income : false}
        accounts={accounts}
        onClose={close}
        onSaved={(name, edited) => setToast({ id: `saved:${Date.now()}`, text: edited ? `${name} updated` : `${name} added to Coming up` })}
      />
      <CalendarSheet
        visible={open?.name === 'calendar'}
        today={todayISO}
        accounts={byId}
        onClose={close}
        onOpen={openDetail}
        onPay={openPay}
        onSkip={(o) => void doSkip(o)}
      />
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
  return { openDetail, openPay, openAdd, openCalendar, skip: (o: Occurrence) => void doSkip(o), anyOpen: open !== null, elements };
}
