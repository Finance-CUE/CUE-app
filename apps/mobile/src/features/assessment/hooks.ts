import { useAssessmentStore } from '@/features/assessment/store';
import { useAuthStore } from '@/features/auth/store';

export type AssessmentGate = 'loading' | 'required' | 'clear';

/** Whether the signed-in user must finish the assessment before entering the app. */
export function useAssessmentGate(): AssessmentGate {
  const userId = useAuthStore((state) => state.user?.id);
  const pendingUserId = useAssessmentStore((state) => state.pendingUserId);

  if (pendingUserId === undefined) {
    return 'loading';
  }

  return userId && pendingUserId === userId ? 'required' : 'clear';
}
