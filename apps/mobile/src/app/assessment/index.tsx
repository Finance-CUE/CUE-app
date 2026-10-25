import { Redirect, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';

import { useAssessmentGate } from '@/features/assessment/hooks';
import { AssessmentFlowScreen } from '@/features/assessment/screens/AssessmentFlowScreen';
import { useAuthStore } from '@/features/auth/store';

export default function AssessmentRoute() {
  const status = useAuthStore((state) => state.status);
  const gate = useAssessmentGate();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const isRetake = retake === '1';

  // Decided once on entry: finishing the quiz clears the pending flag, and a
  // live check would then bounce a first-time user off their results screen.
  const entry = useRef<'allowed' | 'denied' | null>(null);

  if (status === 'restoring' || (status === 'authenticated' && gate === 'loading')) {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/" />;
  }

  // Only a pending signup or an explicit retake gets in. Anything else - a
  // restored dev route, a deep link - would otherwise drop a login user into
  // the quiz, which the assessment design rules out.
  entry.current ??= gate === 'required' || isRetake ? 'allowed' : 'denied';

  if (entry.current === 'denied') {
    return <Redirect href="/today" />;
  }

  return <AssessmentFlowScreen retake={isRetake} />;
}
