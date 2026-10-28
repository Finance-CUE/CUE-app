import { Redirect, Tabs } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAssessmentGate } from '@/features/assessment/hooks';
import { COLORS } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { TabBar } from '@/features/money/components/TabBar';
import { useNudgePlan } from '@/features/money/hooks';
import { syncNudgePlan } from '@/features/money/notifications';

export default function TabsLayout() {
  const status = useAuthStore((state) => state.status);
  const gate = useAssessmentGate();
  const plan = useNudgePlan(status === 'authenticated').data;

  const queryClient = useQueryClient();

  // Refetch on resume so the 7-day schedule keeps rolling forward without a
  // cold start. Scoped to the plan; other queries keep refetchOnWindowFocus off.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') queryClient.invalidateQueries({ queryKey: ['money', 'nudge-plan'] });
    });
    return () => sub.remove();
  }, [queryClient]);

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
