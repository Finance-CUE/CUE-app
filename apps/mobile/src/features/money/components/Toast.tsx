import { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';

export type ToastAction = { label: string; onPress: () => void };
export type ToastMessage = {
  /** Changes for each toast, so the timer restarts. */
  id: string;
  text: string;
  action?: ToastAction;
  /** A quiet second line, e.g. the low-balance note, with its own action. */
  note?: { text: string; action: ToastAction };
};

/** How long Undo stays available (spec: 5-second Undo). */
export const TOAST_MS = 5000;

/**
 * "Expense saved · Undo" at the bottom of the screen, above the nav. It
 * goes after TOAST_MS, or straight away once an action is tapped. A toast
 * with a note stays twice as long, so there is time to read it.
 */
export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.note ? TOAST_MS * 2 : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;

  const tap = (a: ToastAction) => () => {
    onDone();
    a.onPress();
  };
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        // Above the + button (bottom 24, 56 high); the tab bar is outside this screen.
        bottom: 92,
        borderRadius: 14,
        backgroundColor: COLORS.text,
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
        <Text style={{ fontFamily: FONT.medium, color: COLORS.white, fontSize: 14, flex: 1 }}>{toast.text}</Text>
        {toast.action ? (
          <TouchableOpacity accessibilityRole="button" onPress={tap(toast.action)} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}>
            <Text style={{ fontFamily: FONT.semibold, color: COLORS.white, fontSize: 14 }}>{toast.action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {toast.note ? (
        <TouchableOpacity accessibilityRole="button" onPress={tap(toast.note.action)} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.medium, color: COLORS.white, opacity: 0.85, fontSize: 13 }}>
            {toast.note.text} <Text style={{ fontFamily: FONT.semibold }}>{toast.note.action.label}</Text>
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
