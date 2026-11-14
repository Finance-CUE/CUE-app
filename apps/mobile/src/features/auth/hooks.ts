import { useMutation } from '@tanstack/react-query';

import { fetchResult } from '@/features/assessment/api';
import { useAssessmentStore } from '@/features/assessment/store';
import * as authApi from '@/features/auth/api';
import { pickGoogleAccount } from '@/features/auth/google';
import { useAuthStore } from '@/features/auth/store';
import type {
  LoginPayload,
  ResetPasswordPayload,
  Session,
  SignupPayload,
  VerifyEmailPayload,
} from '@/features/auth/types';
import { refreshNow } from '@/lib/api';

/**
 * Store the session, and send anyone without an assessment result to the
 * assessment. Covers first-time Google users and accounts verified late.
 */
async function startSession(session: Session, { newAccount }: { newAccount: boolean }) {
  await useAuthStore.getState().setSession(session);
  let needsAssessment = newAccount;
  if (!newAccount) {
    try {
      needsAssessment = (await fetchResult()) === null;
    } catch {
      // Unknown: let them in. The You tab offers the assessment anyway.
      needsAssessment = false;
    }
  }
  if (needsAssessment) {
    await useAssessmentStore.getState().markPending(session.user.id);
  }
}

// Retrying a rejected credential or code burns the rate limit for no benefit,
// so none of these retry.

export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: setSession,
    retry: false,
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (payload: SignupPayload) => authApi.signup(payload),
    retry: false,
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (payload: VerifyEmailPayload) => {
      const session = await authApi.verifyEmail(payload);
      // A verified signup is always a new account with no assessment yet.
      await startSession(session, { newAccount: true });
      return session;
    },
    retry: false,
  });
}

export function useResendCode() {
  return useMutation({ mutationFn: (email: string) => authApi.resendCode(email), retry: false });
}

/** Resolves to the session, or null when the user closed the Google picker. */
export function useGoogleSignIn() {
  return useMutation({
    mutationFn: async (): Promise<Session | null> => {
      const idToken = await pickGoogleAccount();
      if (!idToken) return null;
      const session = await authApi.googleSignIn(idToken);
      await startSession(session, { newAccount: false });
      return session;
    },
    retry: false,
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => authApi.forgotPassword(email), retry: false });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (payload: ResetPasswordPayload) => {
      const session = await authApi.resetPassword(payload);
      await startSession(session, { newAccount: false });
      return session;
    },
    retry: false,
  });
}

export function useSetPhone() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const user = await authApi.setPhone(phone);
      // The token still carries the old (empty) phone; renew it so /me agrees.
      await refreshNow();
      useAuthStore.getState().setUser(user);
      return user;
    },
    retry: false,
  });
}
