import { create } from 'zustand';

import { setSessionExpiredHandler } from '@/lib/api';
import * as authApi from '@/features/auth/api';
import {
  clearTokens,
  loadTokens,
  saveTokens,
} from '@/features/auth/session';
import type { AuthUser, Session } from '@/features/auth/types';

type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  setSession: (session: Session) => Promise<void>;
  restore: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  user: null,

  setSession: async (session) => {
    await saveTokens(session.access_token, session.refresh_token);
    set({ status: 'authenticated', user: session.user });
  },

  restore: async () => {
    const hasTokens = await loadTokens();

    if (!hasTokens) {
      set({ status: 'unauthenticated', user: null });
      return;
    }

    try {
      // Confirms the token still verifies server-side rather than trusting
      // whatever is in the keychain. A 401 here is refreshed by the axios
      // interceptor; if that also fails the request throws and we sign out.
      const user = await authApi.fetchMe();
      set({ status: 'authenticated', user });
    } catch {
      await clearTokens();
      set({ status: 'unauthenticated', user: null });
    }
  },

  signOut: async () => {
    try {
      await authApi.logout();
    } catch {
      // Revocation is best effort. Local tokens go regardless, so the device
      // is signed out even with no connectivity.
    }

    await clearTokens();
    set({ status: 'unauthenticated', user: null });
  },
}));

// A refresh failure anywhere in the app drops straight to signed out.
setSessionExpiredHandler(() => {
  useAuthStore.setState({ status: 'unauthenticated', user: null });
});
