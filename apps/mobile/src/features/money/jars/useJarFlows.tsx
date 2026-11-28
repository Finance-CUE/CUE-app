import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { toErrorMessage } from '@/lib/api';
import { newClientKey } from '../accounts';
import { PrimaryButton } from '../components/ui';
import { Toast, type ToastMessage } from '../components/Toast';
import { toISODate } from '../dates';
import { useAnswerContribution, useJarAction, useScheduled, useUndoJarMove } from '../hooks';
import { useRupees } from '../privacy';
import { Sheet } from '../sheets/Sheet';
import type { Account, Jar } from '../types';
import { JarFormSheet } from './JarFormSheet';
import { type MoveMode, MoveSheet } from './MoveSheet';

type Open =
  | { name: 'form'; jar: Jar | null }
  | { name: 'move'; mode: MoveMode; jar: Jar | null }
  | { name: 'celebrate'; jar: Jar }
  | null;

/**
 * Everything a jar opens (spec 4.7), shared by Today, the jar list and the jar
 * screen: Create jar, Edit goal, Add money, Withdraw (5-second Undo), approving a
 * suggested contribution and the one-time "Reached" celebration. One sheet at a
 * time. Render `elements` once, outside any scroll view.
 */
export function useJarFlows({ accounts, jars }: { accounts: Account[]; jars: Jar[] }) {
  const formatRupees = useRupees();
  const todayISO = toISODate(new Date());
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const undo = useUndoJarMove();
  const answer = useAnswerContribution();
  const action = useJarAction();
  const scheduled = useScheduled(todayISO);
  const hasSalary = (scheduled.data ?? []).some((s) => s.kind === 'income' && s.category === 'salary' && s.active);
  const close = () => setOpen(null);

  const fail = (err: unknown, fallback: string) =>
    setToast({ id: `jar-error:${Date.now()}`, text: toErrorMessage(err, fallback) });

  const answerContribution = async (jar: Jar, approve: boolean) => {
    if (!jar.next_contribution_on) return;
    try {
      await answer.mutateAsync({ id: jar.id, today: todayISO, client_key: newClientKey(), due_on: jar.next_contribution_on, approve });
    } catch (err) {
      fail(err, "Couldn't save that. Please try again.");
      return;
    }
    setToast({
      id: `contribution:${jar.id}:${Date.now()}`,
      text: approve ? `Added ${formatRupees(jar.contribution_paise ?? 0)} to ${jar.name}` : `Skipped this one for ${jar.name}`,
    });
  };

  const act = async (jar: Jar, what: 'pause' | 'resume' | 'complete' | 'archive', done: string) => {
    try {
      await action.mutateAsync({ id: jar.id, action: what, today: todayISO });
    } catch (err) {
      fail(err, "Couldn't save that. Please try again.");
      return false;
    }
    setToast({ id: `${what}:${jar.id}:${Date.now()}`, text: done });
    return true;
  };

  const celebrating = open?.name === 'celebrate' ? open.jar : null;
  const finishCelebration = () => {
    if (celebrating) void action.mutateAsync({ id: celebrating.id, action: 'celebrated', today: todayISO }).catch(() => undefined);
    close();
  };

  const elements = (
    <>
      <JarFormSheet
        visible={open?.name === 'form'}
        jar={open?.name === 'form' ? open.jar : null}
        accounts={accounts}
        hasSalary={hasSalary}
        onClose={close}
        onSaved={(jar, created) =>
          setToast({ id: `jar-saved:${jar.id}:${Date.now()}`, text: created ? `${jar.icon} ${jar.name} created` : `${jar.name} updated` })
        }
      />
      <MoveSheet
        visible={open?.name === 'move'}
        mode={open?.name === 'move' ? open.mode : 'add'}
        jar={open?.name === 'move' ? open.jar : null}
        jars={jars}
        accounts={accounts}
        onClose={close}
        onNewJar={() => setOpen({ name: 'form', jar: null })}
        onMoved={(move, jar, mode) =>
          setToast({
            id: `move:${move.id}:${Date.now()}`,
            text: mode === 'add' ? `Added ${formatRupees(move.amount_paise)} to ${jar.name}` : `Withdrew ${formatRupees(-move.amount_paise)} from ${jar.name}`,
            action: {
              label: 'Undo',
              onPress: () => void undo.mutateAsync({ id: move.id, today: todayISO }).catch((err) => fail(err, "Couldn't undo that.")),
            },
          })
        }
      />
      <Sheet visible={celebrating !== null} onClose={finishCelebration} title={celebrating ? `${celebrating.icon} Reached 🎉` : ''}>
        {celebrating ? (
          <>
            <Text style={{ fontFamily: FONT.amount, fontSize: 26, color: COLORS.text }}>
              You saved {formatRupees(celebrating.target_paise)} for {celebrating.name}.
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.muted }}>
              The money stays set aside until you withdraw it or archive the jar.
            </Text>
            <PrimaryButton label="Lovely" onPress={finishCelebration} />
          </>
        ) : null}
      </Sheet>
      <Toast toast={toast} onDone={clearToast} />
    </>
  );

  return {
    openCreate: () => setOpen({ name: 'form', jar: null }),
    openEdit: (jar: Jar) => setOpen({ name: 'form', jar }),
    openMove: (mode: MoveMode, jar: Jar | null = null) => setOpen({ name: 'move', mode, jar }),
    /** The one-time celebration for a reached jar; call once when one is found. */
    celebrate: (jar: Jar) => setOpen((cur) => cur ?? { name: 'celebrate', jar }),
    answerContribution: (jar: Jar, approve: boolean) => void answerContribution(jar, approve),
    act,
    busy: answer.isPending || action.isPending,
    anyOpen: open !== null,
    elements,
  };
}
