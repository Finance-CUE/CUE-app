import { Redirect } from 'expo-router';

import { AssessmentFlowScreen } from '@/features/assessment/screens/AssessmentFlowScreen';
import { useAuthStore } from '@/features/auth/store';

export default function AssessmentRoute() {
  const status = useAuthStore((state) => state.status);

  if (status === 'restoring') {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/" />;
  }

  return <AssessmentFlowScreen />;
}
