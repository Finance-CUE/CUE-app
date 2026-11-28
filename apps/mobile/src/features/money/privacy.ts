import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { displayRupees } from './format.ts';

const KEY = 'cue.amountsHidden';

interface PrivacyState {
  /** True when the eye toggle has hidden every amount in the app. */
  hidden: boolean;
  hydrate: () => Promise<void>;
  toggle: () => void;
}

/** The eye toggle on the net worth card (Dashboard spec, section 7), remembered across restarts. */
export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  hidden: false,

  hydrate: async () => {
    try {
      set({ hidden: (await AsyncStorage.getItem(KEY)) === '1' });
    } catch {
      // Unreadable storage: amounts stay visible, which is the default.
    }
  },

  toggle: () => {
    const hidden = !get().hidden;
    set({ hidden });
    AsyncStorage.setItem(KEY, hidden ? '1' : '0').catch(() => {
      // The choice still holds for this session.
    });
  },
}));

/** Formats paise for display, masked while amounts are hidden. Typed input is never masked. */
export function useRupees(): (paise: number) => string {
  const hidden = usePrivacyStore((s) => s.hidden);
  return (paise) => displayRupees(paise, hidden);
}
