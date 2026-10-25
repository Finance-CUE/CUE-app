import { Redirect } from 'expo-router';

import { useAssessmentGate } from '@/features/assessment/hooks';
import { WelcomeLoginScreen } from '@/features/auth/screens/WelcomeLoginScreen';
import { useAuthStore } from '@/features/auth/store';

export default function Index() {
  const status = useAuthStore((state) => state.status);
  const gate = useAssessmentGate();

  // The splash overlay stays up while the keychain and storage are read, so
  // rendering nothing here avoids a flash of the login screen for a signed-in user.
  if (status === 'restoring' || (status === 'authenticated' && gate === 'loading')) {
    return null;
  }

  if (status === 'authenticated') {
    return <Redirect href={gate === 'required' ? '/assessment' : '/today'} />;
  }

  return <WelcomeLoginScreen />;
}
