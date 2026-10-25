import { Redirect, Tabs } from 'expo-router';

import { useAssessmentGate } from '@/features/assessment/hooks';
import { COLORS } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { TabBar } from '@/features/money/components/TabBar';

export default function TabsLayout() {
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
