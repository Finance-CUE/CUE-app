import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { Card, EmptyCard, Fab, Row, ScreenHeader, ScreenScroll, SectionHeader } from '../components/ui';
import { formatRupees } from '../format';
import { useDeleteKhata, useKhata, useSettleKhata } from '../hooks';
import { EntryDetailSheet } from '../sheets/EntryDetailSheet';
import { KhataSheet } from '../sheets/KhataSheet';
import type { Direction, KhataEntry } from '../types';

export function KhataScreen() {
  const queryClient = useQueryClient();
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
  const settle = useSettleKhata();
  const remove = useDeleteKhata();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<KhataEntry | null>(null);

  const entries = khata.data ?? [];

  const section = (title: string, direction: Direction, empty: string) => {
    const list = entries.filter((e) => e.direction === direction);
    const total = list.reduce((sum, e) => sum + e.amount_paise, 0);
    return (
      <>
        <SectionHeader
          title={title}
          right={<Text style={{ fontSize: 13, color: COLORS.muted }}>{formatRupees(total)} total</Text>}
        />
        {khata.isLoading ? (
          <Card>
            <ActivityIndicator color={COLORS.purple} />
          </Card>
        ) : khata.isError ? (
          <EmptyCard text="Could not load. Pull to refresh." />
        ) : list.length ? (
          <Card>
            {list.map((e) => (
              <Row
                key={e.id}
                title={e.person}
                subtitle={e.note || undefined}
                amount={formatRupees(e.amount_paise)}
                onPress={() => setSelected(e)}
              />
            ))}
          </Card>
        ) : (
          <EmptyCard text={empty} />
        )}
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <ScreenHeader eyebrow="The quiet ledger" title="Khata" />
        {section('People owe you', 'lent', 'No one owes you anything right now.')}
        {section('You owe', 'borrowed', "You don't owe anyone right now.")}
        <Card style={{ backgroundColor: COLORS.sageTint, borderColor: COLORS.sageTint, borderRadius: 22, padding: 22 }}>
          <Text
            style={{ textAlign: 'center', fontSize: 16, lineHeight: 24, color: COLORS.text, fontFamily: HEADING_FONT }}>
            {'This is the ledger no bank app shows you.\nEvery rupee lent or borrowed, counted in your net worth.'}
          </Text>
        </Card>
      </ScreenScroll>

      <Fab accessibilityLabel="Add a khata entry" onPress={() => setAdding(true)} />
      <KhataSheet visible={adding} onClose={() => setAdding(false)} />
      <EntryDetailSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.person ?? ''}
        lines={
          selected
            ? [
                `${selected.direction === 'lent' ? 'You lent' : 'You borrowed'} ${formatRupees(selected.amount_paise)}`,
                ...(selected.note ? [selected.note] : []),
              ]
            : []
        }
        onSettle={async () => {
          if (selected) await settle.mutateAsync(selected.id);
        }}
        onDelete={async () => {
          if (selected) await remove.mutateAsync(selected.id);
        }}
      />
    </View>
  );
}
