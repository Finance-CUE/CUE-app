import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'cue.assessment.pendingUserId';

interface AssessmentState {
  /**
   * The user who must still finish the assessment. `undefined` until storage
   * has been read; `null` when nobody is pending. Storing the id rather than a
   * boolean means a different account signing in on this device is never
   * forced into someone else's quiz.
   *
   * This is a UX gate, not authorisation: nothing server-side depends on it.
   */
  pendingUserId: string | null | undefined;
  hydrate: () => Promise<void>;
  markPending: (userId: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAssessmentStore = create<AssessmentState>((set) => ({
  pendingUserId: undefined,

  hydrate: async () => {
    try {
      set({ pendingUserId: await AsyncStorage.getItem(KEY) });
    } catch {
      set({ pendingUserId: null });
    }
  },

  markPending: async (userId) => {
    set({ pendingUserId: userId });
    try {
      await AsyncStorage.setItem(KEY, userId);
    } catch {
      // In-memory flag still gates this session; a failed write only costs resume-after-kill.
    }
  },

  clear: async () => {
    set({ pendingUserId: null });
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // Same as above.
    }
  },
}));
