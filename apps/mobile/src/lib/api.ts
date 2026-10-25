import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';

import { API_BASE_URL } from '@/lib/env';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
} from '@/features/auth/session';

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Bare client for the refresh call. Using `api` here would re-enter the
 * response interceptor and loop on a failing refresh.
 */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Set by the auth store. Kept as a callback rather than a direct import so the
 * store can depend on the client without the client depending on the store.
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }

  return config;
});

// One shared refresh across concurrent 401s, so a burst of requests triggers a
// single refresh rather than racing and invalidating each other's new token.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const token = getRefreshToken();

  if (!token) {
    return false;
  }

  try {
    const response = await refreshClient.post('/auth/refresh', {
      refresh_token: token,
    });

    await saveTokens(response.data.access_token, response.data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status !== 401 || !config || config._retried) {
      return Promise.reject(error);
    }

    config._retried = true;

    refreshInFlight = refreshInFlight ?? refreshSession();
    const refreshed = await refreshInFlight;
    refreshInFlight = null;

    if (!refreshed) {
      await clearTokens();
      onSessionExpired?.();
      return Promise.reject(error);
    }

    return api(config);
  },
);

/**
 * Turns an axios failure into a message safe to show a user.
 *
 * The backend already returns generic strings for auth failures; this is the
 * client-side guard against rendering a raw network error or an unexpected
 * upstream body into the UI.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === 'string' && detail.length > 0 && detail.length < 200) {
      return detail;
    }

    if (!error.response) {
      return 'Could not reach CUE. Check your connection and try again.';
    }
  }

  return fallback;
}
