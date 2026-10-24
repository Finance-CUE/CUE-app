import { Redirect, useLocalSearchParams } from 'expo-router';

import { AssessmentFlowScreen } from '@/features/assessment/screens/AssessmentFlowScreen';
import { useAuthStore } from '@/features/auth/store';

export default function AssessmentRoute() {
  const status = useAuthStore((state) => state.status);
  const { retake } = useLocalSearchParams<{ retake?: string }>();

  if (status === 'restoring') {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/" />;
  }

  return <AssessmentFlowScreen retake={retake === '1'} />;
}
