/**
 * Runtime configuration for the app bundle.
 *
 * The ONLY value the app is allowed to know is where our backend lives.
 * Supabase URLs and keys never appear here, in app.json, or anywhere else on
 * the client - anything bundled into an APK is readable by anyone who
 * downloads it. All Supabase access goes through the backend.
 */

const FALLBACK_DEV_URL = 'http://localhost:8000/api/v1';

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (!configured) {
    if (__DEV__) {
      console.warn(
        '[cue] EXPO_PUBLIC_API_URL is not set. Falling back to ' +
          `${FALLBACK_DEV_URL}. On a physical device this will not reach ` +
          'your machine - set your LAN IP in apps/mobile/.env.',
      );
      return FALLBACK_DEV_URL;
    }

    throw new Error('EXPO_PUBLIC_API_URL must be set for a production build.');
  }

  // A release build talking to the API over plaintext would put access tokens
  // on the wire in clear. Fail the build rather than ship that.
  if (!__DEV__ && !configured.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use https in a production build.');
  }

  return configured.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl();
