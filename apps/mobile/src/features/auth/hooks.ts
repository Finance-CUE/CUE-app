import { useMutation } from '@tanstack/react-query';

import * as authApi from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/store';
import type { LoginPayload, SignupPayload } from '@/features/auth/types';

export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: setSession,
    // Retrying a rejected credential burns the rate limit for no benefit.
    retry: false,
  });
}

export function useSignup() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (payload: SignupPayload) => authApi.signup(payload),
    onSuccess: setSession,
    retry: false,
  });
}
