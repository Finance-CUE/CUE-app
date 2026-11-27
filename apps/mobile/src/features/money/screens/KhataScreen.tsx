import { useQueryClient } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, HEADING_FONT, ROLES, useDashboardTheme } from '@/features/money/palette';
import { Card, EmptyCard, Fab, Row, ScreenHeader, ScreenScroll, SectionHeader, useProfileAvatar } from '../components/ui';
import { toISODate } from '../dates';
import { myBalanceLine } from '../groups/model';
import { useSharedFlows } from '../groups/useSharedFlows';
import { useGroups, useKhata, useNetWorth, useToday } from '../hooks';
import { personBalances, type PersonBalance } from '../khata';
import { useRupees } from '../privacy';
import { PersonSheet } from '../sheets/PersonSheet';
import { LightButton } from '../today/parts';

type Tab = 'personal' | 'groups';

/**
 * Khata: the home for money lent, borrowed and shared (spec P3). Personal holds
 * people one to one; Groups holds shared expenses. ?tab=groups opens Groups
 * (the breakdown's group rows link here).
 */
export function KhataScreen() {
  // Masked while the eye toggle hides amounts.
  const formatRupees = useRupees();
  const theme = useDashboardTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const avatar = useProfileAvatar();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'groups' ? 'groups' : 'personal');
  useEffect(() => {
    if (params.tab === 'groups' || params.tab === 'personal') setTab(params.tab);
  }, [params.tab]);
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
  const groups = useGroups();
  const accounts = useNetWorth(toISODate(useToday())).data?.accounts ?? [];
  const flows = useSharedFlows({ accounts, onGroupCreated: (id) => router.push(`/group/${id}` as Href) });
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
          right={<Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{formatRupees(Math.abs(total))} total</Text>}
        />
        {khata.isLoading ? (
          <Card>
            <ActivityIndicator color={theme.accent} />
          </Card>
        ) : khata.isError ? (
          <EmptyCard text="Could not load. Pull to refresh." />
        ) : list.length ? (
          <Card>
            {list.map((p) => {
              const due = p.entries.map((e) => e.due_on).filter(Boolean).sort()[0];
              return (
                <Row
                  key={p.key}
                  title={p.person}
                  subtitle={[p.entries.length === 1 ? '1 open entry' : `${p.entries.length} open entries`, due ? `due ${due.slice(8, 10)}/${due.slice(5, 7)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  amount={formatRupees(Math.abs(p.net_paise))}
                  onPress={() => setSelectedKey(p.key)}
                />
              );
            })}
          </Card>
        ) : (
          <EmptyCard text={empty} />
        )}
      </>
    );
  };

  const settled = people.filter((p) => p.net_paise === 0);
  const g = groups.data;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <ScreenHeader eyebrow="The quiet ledger" title="Khata" {...avatar} />
        <View style={{ flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 4 }}>
          {(['personal', 'groups'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === t ? ROLES.accentSoft : 'transparent' }}>
              <Text style={{ fontFamily: tab === t ? FONT.semibold : FONT.medium, fontSize: 14, color: tab === t ? ROLES.accent : COLORS.muted }}>
                {t === 'personal' ? 'Personal' : 'Groups'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'personal' ? (
          <>
            {section('People owe you', people.filter((p) => p.net_paise > 0), 'No one owes you anything right now.')}
            {section('You owe', people.filter((p) => p.net_paise < 0), "You don't owe anyone right now.")}
            {settled.length ? section('Settled up', settled, '') : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <LightButton label="Lend" onPress={() => flows.openLend('lent')} />
              <LightButton label="Borrow" onPress={() => flows.openLend('borrowed')} />
              <LightButton label="Record a payment" onPress={() => flows.openSettlement({ kind: 'person' })} />
            </View>
          </>
        ) : (
          <>
            {g ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Card style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>Owed to you</Text>
                  <Text style={{ fontFamily: HEADING_FONT, fontSize: 22, color: COLORS.text }}>{formatRupees(g.owed_to_you_paise)}</Text>
                </Card>
                <Card style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>You owe</Text>
                  <Text style={{ fontFamily: HEADING_FONT, fontSize: 22, color: COLORS.text }}>{formatRupees(g.you_owe_paise)}</Text>
                </Card>
              </View>
            ) : null}
            <SectionHeader title="Your groups" />
            {groups.isLoading ? (
              <Card>
                <ActivityIndicator color={theme.accent} />
              </Card>
            ) : groups.isError ? (
              <EmptyCard text="Could not load. Pull to refresh." />
            ) : g && g.groups.length ? (
              <Card>
                {g.groups.map((x) => (
                  <Row
                    key={x.id}
                    left={<Text style={{ fontSize: 22 }}>{x.icon}</Text>}
                    title={x.name}
                    subtitle={`${x.member_count} people · ${myBalanceLine(x.my_balance_paise, formatRupees)}`}
                    onPress={() => router.push(`/group/${x.id}` as Href)}
                  />
                ))}
              </Card>
            ) : (
              <EmptyCard text="Split trips, flats and dinners with friends. Only you need CUE." />
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <LightButton label="+ New group" onPress={() => flows.openGroupForm(null)} />
              {g && g.groups.length ? <LightButton label="Add expense" onPress={() => flows.openGroupExpense(null)} /> : null}
            </View>
          </>
        )}

        <Card style={{ backgroundColor: COLORS.sageTint, borderColor: COLORS.sageTint, borderRadius: 22, padding: 22 }}>
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 24, color: COLORS.text, fontFamily: HEADING_FONT }}>
            {'This is the ledger no bank app shows you.\nEvery rupee lent, borrowed or shared, on record and counted in your net worth.'}
          </Text>
        </Card>
      </ScreenScroll>

      <Fab
        accessibilityLabel={tab === 'personal' ? 'Lend or borrow' : 'Add a group expense'}
        onPress={() => (tab === 'personal' ? flows.openLend('lent') : g && g.groups.length ? flows.openGroupExpense(null) : flows.openGroupForm(null))}
      />
      <PersonSheet
        person={selected}
        onClose={() => setSelectedKey(null)}
        onRecordPayment={(p) => {
          setSelectedKey(null);
          flows.openSettlement({ kind: 'person', person: p.person, fromThem: p.net_paise >= 0 });
        }}
      />
      {flows.elements}
    </View>
  );
}
