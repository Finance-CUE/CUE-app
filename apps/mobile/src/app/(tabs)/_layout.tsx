import { type Href, Redirect, router, Tabs } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAssessmentGate } from '@/features/assessment/hooks';
import { COLORS } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { TabBar } from '@/features/money/components/TabBar';
import { useNudgePlan, useSummary } from '@/features/money/hooks';
import { syncNudgePlan, watchSubscriptionTaps } from '@/features/money/notifications';

export default function TabsLayout() {
  const status = useAuthStore((state) => state.status);
  const gate = useAssessmentGate();
  const plan = useNudgePlan(status === 'authenticated').data;
  const summary = useSummary(status === 'authenticated' && gate === 'clear');

  const queryClient = useQueryClient();

  // Refetch on resume so the 7-day schedule keeps rolling forward and cycles that
  // came due surface without a cold start. The subscriptions prefix covers the due
  // query. Scoped to these; other queries keep refetchOnWindowFocus off.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      queryClient.invalidateQueries({ queryKey: ['money', 'nudge-plan'] });
      queryClient.invalidateQueries({ queryKey: ['money', 'subscriptions'] });
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    return watchSubscriptionTaps(() => {
      queryClient.invalidateQueries({ queryKey: ['money', 'subscriptions'] });
      // navigate alone would push a second (tabs) over a stacked screen like /net-worth.
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/today');
    });
  }, [status, queryClient]);

  useEffect(() => {
    // A notification failure must never break the UI.
    if (plan) syncNudgePlan(plan).catch(() => {});
  }, [plan]);

  if (status === 'restoring' || (status === 'authenticated' && gate === 'loading')) {
    return null;
  }

  if (status !== 'authenticated') {
    return <Redirect href="/" />;
  }

  if (gate === 'required') {
    return <Redirect href="/assessment" />;
  }

  if (summary.isPending) {
    return null;
  }

  // A summary error never gates; only a loaded summary with no balance does.
  // (Cast: typed routes regenerate on the next expo start.)
  if (summary.data && summary.data.starting_money === null) {
    return <Redirect href={'/onboarding-balance' as Href} />;
  }

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: COLORS.background } }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="khata" options={{ title: 'Khata' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
