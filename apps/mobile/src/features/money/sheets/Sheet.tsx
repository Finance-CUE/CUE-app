import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { toErrorMessage } from '@/lib/api';

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity
          accessibilityLabel="Close"
          activeOpacity={1}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(41,37,49,0.35)' }}
        />
        <View
          style={{
            maxHeight: '90%',
            backgroundColor: COLORS.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 24,
            paddingTop: 10,
            paddingBottom: 28,
          }}>
          <View
            style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 14 }}
          />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 22, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>{title}</Text>
              {subtitle ? <Text style={{ fontSize: 14, color: COLORS.muted }}>{subtitle}</Text> : null}
            </View>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? <Text style={{ color: COLORS.error, fontSize: 14 }}>{message}</Text> : null;
}

/**
 * Wraps a save action: a ref blocks re-entry before the pending state renders,
 * and a failure keeps the sheet open (values untouched) with an inline message.
 */
export function useGuardedSubmit(visible: boolean, fallback = 'Could not save. Please try again.') {
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const reset = useCallback(() => setError(null), []);
  // A failure must not outlive the sheet: clear it whenever the sheet opens.
  useEffect(() => {
    if (visible) reset();
  }, [visible, reset]);
  const run = useCallback(
    async (action: () => Promise<unknown>, onDone: () => void) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(toErrorMessage(err, fallback));
        inFlight.current = false;
        return;
      }
      inFlight.current = false;
      onDone();
    },
    [fallback],
  );
  return { run, error, reset };
}
