import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { Card, EmptyCard, Fab, Row, ScreenHeader, ScreenScroll, SectionHeader, useProfileAvatar } from '../components/ui';
import { formatRupees } from '../format';
import { useKhata } from '../hooks';
import { personBalances, type PersonBalance } from '../khata';
import { KhataSheet } from '../sheets/KhataSheet';
import { PersonSheet } from '../sheets/PersonSheet';

export function KhataScreen() {
  const queryClient = useQueryClient();
  const avatar = useProfileAvatar();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['money'] });
    } finally {
      setRefreshing(false);
    }
  };
  const khata = useKhata();
  const [adding, setAdding] = useState(false);
  // The key, not the object, so the sheet reflects refreshed data.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const people = personBalances(khata.data ?? []);
  const selected = people.find((p) => p.key === selectedKey);

  // The person's last entry is gone: drop the key so a later same-name entry doesn't reopen the sheet.
  useEffect(() => {
    if (selectedKey !== null && !selected && khata.isSuccess) setSelectedKey(null);
  }, [selectedKey, selected, khata.isSuccess]);

  const section = (title: string, list: PersonBalance[], empty: string) => {
    const total = list.reduce((sum, p) => sum + p.net_paise, 0);
    return (
      <>
        <SectionHeader
          title={title}
          right={<Text style={{ fontSize: 13, color: COLORS.muted }}>{formatRupees(Math.abs(total))} total</Text>}
        />
        {khata.isLoading ? (
          <Card>
            <ActivityIndicator color={COLORS.purple} />
          </Card>
        ) : khata.isError ? (
          <EmptyCard text="Could not load. Pull to refresh." />
        ) : list.length ? (
          <Card>
            {list.map((p) => (
              <Row
                key={p.key}
                title={p.person}
                subtitle={p.entries.length === 1 ? '1 open entry' : `${p.entries.length} open entries`}
                amount={formatRupees(Math.abs(p.net_paise))}
                onPress={() => setSelectedKey(p.key)}
              />
            ))}
          </Card>
        ) : (
          <EmptyCard text={empty} />
        )}
      </>
    );
  };

  const settled = people.filter((p) => p.net_paise === 0);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <ScreenHeader eyebrow="The quiet ledger" title="Khata" {...avatar} />
        {section('People owe you', people.filter((p) => p.net_paise > 0), 'No one owes you anything right now.')}
        {section('You owe', people.filter((p) => p.net_paise < 0), "You don't owe anyone right now.")}
        {settled.length ? section('Settled up', settled, '') : null}
        <Card style={{ backgroundColor: COLORS.sageTint, borderColor: COLORS.sageTint, borderRadius: 22, padding: 22 }}>
          <Text
            style={{ textAlign: 'center', fontSize: 16, lineHeight: 24, color: COLORS.text, fontFamily: HEADING_FONT }}>
            {'This is the ledger no bank app shows you.\nEvery rupee lent or borrowed, counted in your net worth.'}
          </Text>
        </Card>
      </ScreenScroll>

      <Fab accessibilityLabel="Add a khata entry" onPress={() => setAdding(true)} />
      <KhataSheet visible={adding} onClose={() => setAdding(false)} />
      <PersonSheet person={selected} onClose={() => setSelectedKey(null)} />
    </View>
  );
}
