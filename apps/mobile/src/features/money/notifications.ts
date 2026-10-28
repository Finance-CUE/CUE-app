import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedNudge } from '@/features/money/types';

const CHANNEL_ID = 'nudges';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Every sync and cancel runs one at a time on this chain. Each call bumps the
// generation, so an older sync still in flight sees it is stale and stops
// before scheduling anything (e.g. the previous user's nudges after sign-out).
let chain: Promise<void> = Promise.resolve();
let generation = 0;

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task);
  chain = run.catch(() => {});
  return run;
}

/** Cancels scheduled nudges and clears delivered ones from the tray. */
export function cancelAllNudges(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  generation += 1;
  return enqueue(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  });
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Replaces every scheduled notification with the server's plan. */
export function syncNudgePlan(plan: PlannedNudge[]): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  const gen = ++generation;
  const stale = () => gen !== generation;

  return enqueue(async () => {
    if (stale()) return;

    if (plan.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Nudges',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
      if (stale()) return;
    }

    if (!(await ensurePermission()) || stale()) return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = Date.now();
    for (const nudge of plan) {
      if (stale()) return;
      const date = new Date(nudge.fire_at);
      if (date.getTime() <= now) continue;
      // Inexact alarm (no SCHEDULE_EXACT_ALARM): Android may deliver a few minutes late.
      await Notifications.scheduleNotificationAsync({
        identifier: nudge.id,
        content: { title: nudge.title, body: nudge.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      });
    }
  });
}
