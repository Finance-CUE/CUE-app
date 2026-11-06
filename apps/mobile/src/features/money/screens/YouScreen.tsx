import { useQuery } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, TouchableOpacity, View } from 'react-native';

import { fetchResult } from '@/features/assessment/api';
import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { Sparkline } from '../components/Sparkline';
import { Card, ScreenHeader, ScreenScroll, SecondaryButton, useProfileAvatar } from '../components/ui';
import { categoryLabel } from '../categories';
import { startOfWeek, toISODate } from '../dates';
import { formatRupees } from '../format';
import { useNudgePlan, useNudges, useSaveNudges, useSpends, useToday, useTrend } from '../hooks';
import { weeklyReflection } from '../reflection';
import type { Nudges, PlannedNudge } from '../types';

const NUDGE_ROWS: { key: keyof Nudges; title: string; subtitle: string }[] = [
  { key: 'pre_spend', title: 'Pre-spend pause', subtitle: 'Before unplanned spends' },
  { key: 'patterns', title: 'Pattern nudges', subtitle: "Only when there's enough evidence" },
  { key: 'weekly', title: 'Weekly reflection', subtitle: 'Sunday evenings' },
];

/** "Next: Tue, 7:45 pm" for the soonest planned nudge of these kinds, in device local time. */
function nextLabel(plan: PlannedNudge[] | undefined, kinds: PlannedNudge['kind'][]): string | undefined {
  const now = Date.now();
  const next = (plan ?? [])
    .filter((n) => kinds.includes(n.kind) && new Date(n.fire_at).getTime() > now)
    .sort((a, b) => new Date(a.fire_at).getTime() - new Date(b.fire_at).getTime())[0];
  if (!next) return undefined;
  const at = new Date(next.fire_at);
  const day = at.toLocaleDateString('en-IN', { weekday: 'short' });
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `Next: ${day}, ${time}`;
}

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
  const plan = useNudgePlan(true).data;
  const now = useToday();
  const today = toISODate(now);
  const lastWeekStart = startOfWeek(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const spends = useSpends(toISODate(lastWeekStart), today).data;
  const trend = useTrend(today);
  const reflection = spends ? weeklyReflection(spends, now) : null;
  const subtitles: Partial<Record<keyof Nudges, string | undefined>> = {
    pre_spend: nextLabel(plan, ['pre_spend']),
    patterns: nextLabel(plan, ['pattern', 'spike']),
    weekly:
      reflection && reflection.count > 0
        ? `${formatRupees(reflection.thisWeekPaise)} this week, ${formatRupees(reflection.lastWeekPaise)} last week${
            reflection.topCategory ? ` · ${categoryLabel(reflection.topCategory)}` : ''
          }`
        : undefined,
  };
  const save = useSaveNudges();
  // Optimistic value for the switch being saved; cleared on settle so errors revert it.
  const [pending, setPending] = useState<Partial<Nudges>>({});

  const name = user?.full_name?.trim() || 'there';
  const { avatarLetter } = useProfileAvatar();
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <ScreenHeader eyebrow="Your profile" title={name} avatarLetter={avatarLetter} />
        </View>
        <Sparkline points={trend.data ?? []} onPress={() => router.push('/net-worth' as Href) /* typed routes regenerate on next expo start */} />
      </View>

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
        <Text style={{ fontSize: 18, color: COLORS.text, marginBottom: 6, fontFamily: HEADING_FONT }}>Nudge preferences</Text>
        {NUDGE_ROWS.map((r) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>{r.title}</Text>
              <Text style={{ fontSize: 12, color: COLORS.muted }}>{subtitles[r.key] ?? r.subtitle}</Text>
            </View>
            <Switch
              value={pending[r.key] ?? nudges.data?.[r.key] ?? true}
              disabled={!nudges.data || save.isPending}
              onValueChange={(v) => toggle(r.key, v)}
              thumbColor={COLORS.white}
              trackColor={{ true: COLORS.purple, false: COLORS.track }}
              ios_backgroundColor={COLORS.track}
            />
          </View>
        ))}
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
