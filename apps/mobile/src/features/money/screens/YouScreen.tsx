import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, TouchableOpacity, View } from 'react-native';

import { fetchResult } from '@/features/assessment/api';
import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { PlusIcon } from '../components/icons';
import { Card, ScreenHeader, ScreenScroll, SecondaryButton } from '../components/ui';
import { useNudges, useSaveNudges } from '../hooks';
import type { Nudges } from '../types';

const NUDGE_ROWS: { key: keyof Nudges; title: string; subtitle: string }[] = [
  { key: 'pre_spend', title: 'Pre-spend pause', subtitle: 'Before unplanned spends' },
  { key: 'patterns', title: 'Pattern nudges', subtitle: "Only when there's enough evidence" },
  { key: 'weekly', title: 'Weekly reflection', subtitle: 'Sunday evenings' },
];

function takenLabel(computedAt: string | null): string | null {
  if (!computedAt) return null;
  const days = Math.max(0, Math.floor((Date.now() - new Date(computedAt).getTime()) / 86_400_000));
  const when = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return `Based on your full assessment · taken ${when}`;
}

export function YouScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const result = useQuery({ queryKey: ['assessment', 'result'], queryFn: fetchResult });
  const nudges = useNudges();
  const save = useSaveNudges();
  // Optimistic value for the switch being saved; cleared on settle so errors revert it.
  const [pending, setPending] = useState<Partial<Nudges>>({});

  const name = user?.full_name?.trim() || 'there';
  const letter = (user?.full_name?.trim()?.[0] ?? 'C').toUpperCase();
  const primary = result.data?.primary;
  const taken = takenLabel(result.data?.computed_at ?? null);

  const toggle = (key: keyof Nudges, value: boolean) => {
    if (!nudges.data || save.isPending) return;
    setPending({ [key]: value });
    save.mutate(
      { ...nudges.data, [key]: value },
      {
        onError: () => Alert.alert('Could not save', 'Your nudge preference was not saved. Please try again.'),
        onSettled: () => setPending({}),
      },
    );
  };

  return (
    <ScreenScroll>
      <ScreenHeader eyebrow="Your profile" title={name} avatarLetter={letter} avatarColor={COLORS.sage} />

      <Card style={{ borderLeftWidth: 4, borderLeftColor: COLORS.purple }}>
        {result.isError ? (
          <>
            <Text style={{ fontSize: 15, color: COLORS.muted }}>Could not load your pattern</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => result.refetch()} style={{ paddingVertical: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.purple }}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : primary ? (
          <>
            <Text style={{ fontSize: 11, letterSpacing: 1, color: COLORS.muted }}>THE PATTERN CUE CURRENTLY SEES</Text>
            <Text style={{ fontSize: 24, color: COLORS.text, fontFamily: HEADING_FONT, marginTop: 6 }}>
              {primary.name}
            </Text>
            {taken ? <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 6 }}>{taken}</Text> : null}
          </>
        ) : result.data === null ? (
          <Text style={{ fontSize: 15, color: COLORS.muted }}>Take the assessment to see your pattern</Text>
        ) : null}
      </Card>

      <SecondaryButton label="Retake assessment" onPress={() => router.push('/assessment?retake=1')} />

      <Card>
        <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 6 }}>Nudge preferences</Text>
        {NUDGE_ROWS.map((r) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>{r.title}</Text>
              <Text style={{ fontSize: 12, color: COLORS.muted }}>{r.subtitle}</Text>
            </View>
            <Switch
              value={pending[r.key] ?? nudges.data?.[r.key] ?? true}
              disabled={!nudges.data || save.isPending}
              onValueChange={(v) => toggle(r.key, v)}
              trackColor={{ true: COLORS.purple }}
            />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 6 }}>Linked accounts</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>Manual entries only</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted }}>No bank linked yet</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Link an account"
            onPress={() => Alert.alert('Coming soon', 'Bank linking is on its way.')}
            style={{ padding: 8 }}>
            <PlusIcon color={COLORS.text} size={22} />
          </TouchableOpacity>
        </View>
      </Card>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
        style={{ alignSelf: 'center', paddingVertical: 12 }}>
        <Text style={{ fontSize: 15, color: COLORS.muted }}>Sign out</Text>
      </TouchableOpacity>
    </ScreenScroll>
  );
}
