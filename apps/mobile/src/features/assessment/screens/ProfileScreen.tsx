import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { fetchResult } from '@/features/assessment/api';
import { ArchetypeProfile } from '@/features/assessment/components/ArchetypeProfile';
import { COLORS } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { EmptyCard, ScreenScroll, SecondaryButton } from '@/features/money/components/ui';

/** The full money profile, opened from the You tab. */
export function ProfileScreen() {
  const status = useAuthStore((s) => s.status);
  if (status === 'restoring') return null;
  if (status !== 'authenticated') return <Redirect href="/" />;
  return <ProfileBody />;
}

function ProfileBody() {
  const router = useRouter();
  const result = useQuery({ queryKey: ['assessment', 'result'], queryFn: fetchResult });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
          hitSlop={8}
          style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 16, color: COLORS.purple, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        {result.isPending ? (
          <ActivityIndicator color={COLORS.purple} />
        ) : result.isError ? (
          <EmptyCard text="Could not load your profile. Go back and try again." />
        ) : result.data ? (
          <ArchetypeProfile result={result.data} />
        ) : (
          <>
            <EmptyCard text="Take the assessment to see your money profile." />
            <SecondaryButton label="Take the assessment" onPress={() => router.push('/assessment?retake=1')} />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}
