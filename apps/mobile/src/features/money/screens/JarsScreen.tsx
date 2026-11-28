import { useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { toISODate } from '../dates';
import { useJars, useNetWorth, useToday } from '../hooks';
import { JarCard } from '../jars/JarCard';
import { headerLine } from '../jars/model';
import { useJarFlows } from '../jars/useJarFlows';
import { DetailScreen, Headline, SignedIn } from '../month/parts';
import { useRupees } from '../privacy';
import { CardError, EmptyState, LightButton, Skeleton, TodayCard } from '../today/parts';

export function JarsScreen() {
  return (
    <SignedIn>
      <JarsBody />
    </SignedIn>
  );
}

/** My Goal Jars, View all: every jar in a grid, and Create jar. */
function JarsBody() {
  const formatRupees = useRupees();
  const router = useRouter();
  const queryClient = useQueryClient();
  const todayISO = toISODate(useToday());
  const jars = useJars(todayISO);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const flows = useJarFlows({ accounts, jars: jars.data?.jars ?? [] });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };
  const data = jars.data;

  return (
    <DetailScreen title="My Goal Jars" refreshing={refreshing} onRefresh={refresh} overlay={flows.elements}>
      {!data ? (
        jars.isError ? (
          <CardError message="Couldn't load your jars." onRetry={() => void jars.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '60%', height: 40 }, { width: '100%', height: 150 }]} />
        )
      ) : data.count === 0 ? (
        <TodayCard>
          <EmptyState text="Every big goal starts somewhere. Create your first jar." action="Create jar" onAction={flows.openCreate} />
        </TodayCard>
      ) : (
        <>
          <Headline label="SET ASIDE" amount={formatRupees(data.total_saved_paise)} sub={headerLine(data.total_saved_paise, data.count, formatRupees)} />
          <View style={{ flexDirection: 'row' }}>
            <LightButton label="+ Create jar" onPress={flows.openCreate} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {data.jars.map((j) => (
              <JarCard key={j.id} jar={j} onPress={() => router.push(`/jar/${j.id}` as Href)} />
            ))}
          </View>
        </>
      )}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        Jars set money aside inside your accounts. Your bank balance and net worth never change when you add or withdraw.
      </Text>
    </DetailScreen>
  );
}
