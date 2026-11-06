import { Redirect } from 'expo-router';

import { useAssessmentGate } from '@/features/assessment/hooks';
import { useAuthStore } from '@/features/auth/store';
import { BalanceOnboardingScreen } from '@/features/money/screens/BalanceOnboardingScreen';

export default function OnboardingBalanceRoute() {
  const status = useAuthStore((state) => state.status);
  const gate = useAssessmentGate();

  if (status === 'restoring' || (status === 'authenticated' && gate === 'loading')) {
    return null;
  }

  if (status !== 'authenticated') {
    return <Redirect href="/" />;
  }

  if (gate === 'required') {
    return <Redirect href="/assessment" />;
  }

  return <BalanceOnboardingScreen />;
}
