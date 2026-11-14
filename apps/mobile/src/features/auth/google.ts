/**
 * Native Google account picker. Returns a Google ID token for the backend to
 * trade for a CUE session - the app never talks to Supabase directly.
 *
 * The native module is loaded lazily so a build without it (Expo Go, web)
 * still starts; only tapping the Google button fails, with a clear message.
 */

import { GOOGLE_WEB_CLIENT_ID } from '@/lib/env';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let configured = false;

export class GoogleSignInUnavailable extends Error {}

function load(): GoogleModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    throw new GoogleSignInUnavailable("Google sign-in isn't available in this version of the app.");
  }
}

/** The ID token, or null when the user closed the picker. */
export async function pickGoogleAccount(): Promise<string | null> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new GoogleSignInUnavailable("Google sign-in isn't set up in this version of the app yet.");
  }
  const { GoogleSignin, isErrorWithCode, statusCodes } = load();

  if (!configured) {
    // The web client ID makes Google issue an ID token whose audience the
    // backend's Supabase project trusts.
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success') return null;
    if (!result.data.idToken) {
      throw new Error("Google didn't return your account details. Please try again.");
    }
    return result.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (error.code === statusCodes.IN_PROGRESS) return null;
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google sign-in needs Google Play services. Please update them and try again.');
      }
    }
    if (error instanceof Error && !isErrorWithCode(error)) throw error;
    throw new Error("Google sign-in didn't work. Please try again.");
  }
}

/** Forget the chosen Google account so the picker shows again next time. Best effort. */
export async function forgetGoogleAccount(): Promise<void> {
  if (!configured) return;
  try {
    await load().GoogleSignin.signOut();
  } catch {
    // Nothing to forget, or the module is missing: either way, signed out.
  }
}
