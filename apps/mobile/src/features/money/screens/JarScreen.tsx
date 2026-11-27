import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { COLORS, FONT, ROLES, TYPE } from '@/features/money/palette';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { formatDate, toISODate } from '../dates';
import { useJar, useJars, useNetWorth, useToday } from '../hooks';
import { ProgressBar, TagPill } from '../jars/JarCard';
import { contributionPrompt, jarTag, methodLine, moveLine, shortLine, suggestionLine } from '../jars/model';
import { useJarFlows } from '../jars/useJarFlows';
import { DetailScreen, FigureRow, Headline, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { CardError, EmptyState, GhostChip, LightButton, Skeleton, TodayCard } from '../today/parts';

export function JarScreen({ id }: { id: string }) {
  return (
    <SignedIn>
      <JarBody id={id} />
    </SignedIn>
  );
}

/**
 * The jar screen (spec 4.7): goal, target, money in the jar, remaining,
 * progress, target date, suggested monthly contribution and history. Add money,
 * Withdraw, Edit goal, Pause, Complete and Archive.
 */
function JarBody({ id }: { id: string }) {
  const formatRupees = useRupees();
  const router = useRouter();
  const queryClient = useQueryClient();
  const todayISO = toISODate(useToday());
  const detail = useJar(id, todayISO);
  const jars = useJars(todayISO);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const flows = useJarFlows({ accounts, jars: jars.data?.jars ?? [] });
  const [refreshing, setRefreshing] = useState(false);
  const celebrated = useRef(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };

  const jar = detail.data?.jar;
  // The one-time "Reached" celebration.
  useEffect(() => {
    if (jar && jar.state === 'complete' && !jar.celebrated && !celebrated.current) {
      celebrated.current = true;
      flows.celebrate(jar);
    }
  }, [jar, flows]);

  if (!jar) {
    return (
      <DetailScreen title="Goal Jar">
        {detail.isError ? (
          <CardError message="Couldn't load this jar." onRetry={() => void detail.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '60%', height: 40 }, { width: '100%', height: 10 }, { width: '100%', height: 160 }]} />
        )}
      </DetailScreen>
    );
  }

  const tag = jarTag(jar);
  const account = byId.get(jar.account_id);
  const prompt = contributionPrompt(jar, formatRupees);
  const short = shortLine(jar, byId);
  const moves = detail.data?.moves ?? [];

  const confirmArchive = () =>
    Alert.alert(
      `Archive ${jar.name}?`,
      jar.saved_paise > 0
        ? `The ${formatRupees(jar.saved_paise)} in it goes back to ${account?.name ?? 'your account'}'s free balance.`
        : 'It leaves your jars.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            if (await flows.act(jar, 'archive', `${jar.name} archived`)) router.back();
          },
        },
      ],
    );

  return (
    <DetailScreen title={`${jar.icon} ${jar.name}`} refreshing={refreshing} onRefresh={refresh} overlay={flows.elements}>
      <Headline label="IN THE JAR" amount={formatRupees(jar.saved_paise)} sub={`of ${formatRupees(jar.target_paise)} · ${jar.progress}%`} />
      <ProgressBar progress={jar.progress} paused={jar.state === 'paused'} done={jar.state === 'complete'} height={10} />
      {tag ? (
        <View style={{ flexDirection: 'row' }}>
          <TagPill tag={tag} />
        </View>
      ) : null}
      {short ? (
        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: ROLES.attention }}>
          {short} Move money in or withdraw from a jar to match.
        </Text>
      ) : null}

      {prompt ? (
        <TodayCard>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: COLORS.text }}>{prompt}</Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
            Your suggested contribution is due. Nothing is added until you approve it.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <LightButton label="Approve" onPress={() => flows.answerContribution(jar, true)} />
            <GhostChip label="Skip this one" onPress={() => flows.answerContribution(jar, false)} />
          </View>
        </TodayCard>
      ) : null}

      <TodayCard>
        <FigureRow label="Target" value={formatRupees(jar.target_paise)} />
        <FigureRow label="In the jar" value={formatRupees(jar.saved_paise)} />
        <FigureRow label="Remaining" value={formatRupees(jar.remaining_paise)} />
        <FigureRow label="Progress" value={`${jar.progress}%`} />
        {jar.target_date ? (
          jar.state === 'date_passed' ? (
            <FigureRow label="Target date passed · Edit goal" value={formatDate(jar.target_date)} onPress={() => flows.openEdit(jar)} />
          ) : (
            <FigureRow label="Target date" value={formatDate(jar.target_date)} />
          )
        ) : null}
        {jar.suggested_monthly_paise !== null ? (
          <FigureRow label="Suggested each month" value={formatRupees(jar.suggested_monthly_paise)} />
        ) : null}
        <FigureRow label="Money stays in" value={account?.name ?? '—'} />
        <Text style={{ ...TYPE.meta, color: COLORS.muted }}>{methodLine(jar, formatRupees)}</Text>
        {suggestionLine(jar, formatRupees) && jar.state === 'active' ? (
          <Text style={{ ...TYPE.meta, color: COLORS.muted }}>{suggestionLine(jar, formatRupees)}</Text>
        ) : null}
      </TodayCard>

      <PrimaryButton label="Add money" onPress={() => flows.openMove('add', jar)} />
      <SecondaryButton label="Withdraw" onPress={() => flows.openMove('withdraw', jar)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <GhostChip label="Edit goal" onPress={() => flows.openEdit(jar)} />
        {jar.status === 'active' ? (
          <GhostChip label="Pause contributions" onPress={() => void flows.act(jar, 'pause', `${jar.name} paused`)} />
        ) : jar.status === 'paused' ? (
          <GhostChip label="Resume" onPress={() => void flows.act(jar, 'resume', `${jar.name} resumed`)} />
        ) : null}
        {jar.status !== 'complete' ? (
          <GhostChip label="Complete" onPress={() => void flows.act(jar, 'complete', `${jar.name} marked complete`)} />
        ) : null}
        <GhostChip label="Archive" onPress={confirmArchive} />
      </View>

      <TodayCard title="Contribution history">
        {moves.length === 0 ? (
          <EmptyState text="Nothing added yet." action="Add money" onAction={() => flows.openMove('add', jar)} />
        ) : (
          moves.map((m) => {
            const line = moveLine(m, formatRupees);
            return (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.medium, fontSize: 13.5, color: COLORS.text }}>{line.label}</Text>
                  <Text style={{ ...TYPE.meta, color: COLORS.muted }}>{formatDate(m.occurred_on)}</Text>
                </View>
                <Text style={{ ...TYPE.rowAmount, color: m.amount_paise > 0 ? ROLES.positiveInk : COLORS.text }}>{line.amount}</Text>
              </View>
            );
          })
        )}
      </TodayCard>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        Jars set money aside inside your account. Adding or withdrawing never changes your bank balance or net worth.
      </Text>
    </DetailScreen>
  );
}
