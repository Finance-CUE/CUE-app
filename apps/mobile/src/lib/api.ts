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
 * Renew the access token now, e.g. after the server changed what the token
 * carries. Shares the in-flight refresh with the 401 interceptor.
 */
export async function refreshNow(): Promise<boolean> {
  refreshInFlight = refreshInFlight ?? refreshSession();
  const refreshed = await refreshInFlight;
  refreshInFlight = null;
  return refreshed;
}

/** The backend's stable error code (e.g. "email_not_verified"), if it sent one. */
export function errorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const code = error.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

// No response at all is usually no internet, but can't be told apart from an
// unreachable server without a connectivity check, so the wording covers both.
export const MSG_OFFLINE = "Couldn't connect to CUE. Check your internet connection and try again.";
export const MSG_SLOW = 'CUE is taking longer than usual to respond. Please try again in a moment.';
export const MSG_SERVER = 'Something went wrong on our side. Please try again in a moment.';

/**
 * Turns a failure into a sentence safe to show a user.
 *
 * The backend sends a plain-English `detail` for every error it knows about;
 * this covers the cases where no such sentence exists - no connection, a slow
 * server (a free-tier backend can take ~50s to wake), or an unexpected body.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === 'string' && detail.length > 0 && detail.length < 300) {
      return detail;
    }

    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return MSG_SLOW;
      }
      return MSG_OFFLINE;
    }

    if (error.response.status >= 500) {
      return MSG_SERVER;
    }
  }

  return fallback;
}
