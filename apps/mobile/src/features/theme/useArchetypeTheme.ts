import { useQuery } from '@tanstack/react-query';

import { fetchResult } from '@/features/assessment/api';
import { useAuthStore } from '@/features/auth/store';
import { buildTheme, type ArchetypeTheme } from './archetypeTheme';

/**
 * The signed-in user's archetype theme. Shares the assessment-result query with the
 * You tab and profile, so it costs no extra request; retaking the assessment
 * refreshes that query and the whole app re-themes.
 */
export function useArchetypeTheme(): ArchetypeTheme {
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const result = useQuery({
    queryKey: ['assessment', 'result'],
    queryFn: fetchResult,
    enabled: signedIn,
    staleTime: Infinity,
  });
  return buildTheme(signedIn ? result.data?.primary.slug : null);
}
