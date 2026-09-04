import { Redirect } from 'expo-router';

import { WelcomeLoginScreen } from '@/features/auth/screens/WelcomeLoginScreen';
import { useAuthStore } from '@/features/auth/store';

export default function Index() {
  const status = useAuthStore((state) => state.status);

  // The splash overlay stays up while the keychain is read, so rendering
  // nothing here avoids a flash of the login screen for a signed-in user.
  if (status === 'restoring') {
    return null;
  }

  if (status === 'authenticated') {
    return <Redirect href="/explore" />;
  }

  return <WelcomeLoginScreen />;
}
