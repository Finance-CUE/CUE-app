/**
 * Token persistence.
 *
 * Tokens live in expo-secure-store, which is the iOS Keychain and the Android
 * Keystore - not AsyncStorage, which is plain unencrypted files any rooted
 * device or backup extraction can read.
 *
 * An in-memory mirror keeps the axios request interceptor synchronous; the
 * secure store is the source of truth across app launches.
 */

import { storage } from '@/lib/storage';

const ACCESS_TOKEN_KEY = 'cue.accessToken';
const REFRESH_TOKEN_KEY = 'cue.refreshToken';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function saveTokens(
  nextAccessToken: string,
  nextRefreshToken: string,
): Promise<void> {
  accessToken = nextAccessToken;
  refreshToken = nextRefreshToken;

  await Promise.all([
    storage.set(ACCESS_TOKEN_KEY, nextAccessToken),
    storage.set(REFRESH_TOKEN_KEY, nextRefreshToken),
  ]);
}

export async function loadTokens(): Promise<boolean> {
  try {
    const [storedAccess, storedRefresh] = await Promise.all([
      storage.get(ACCESS_TOKEN_KEY),
      storage.get(REFRESH_TOKEN_KEY),
    ]);

    accessToken = storedAccess ?? null;
    refreshToken = storedRefresh ?? null;

    return Boolean(accessToken && refreshToken);
  } catch {
    // A corrupt or inaccessible keychain entry must not wedge the app on the
    // splash screen. Treat it as signed out.
    accessToken = null;
    refreshToken = null;
    return false;
  }
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;

  await Promise.all([
    storage.remove(ACCESS_TOKEN_KEY),
    storage.remove(REFRESH_TOKEN_KEY),
  ]);
}
