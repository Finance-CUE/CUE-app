import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';
import { toErrorMessage } from '@/lib/api';
import { bankBySlug } from '../banks';
import { ScreenScroll } from '../components/ui';
import { daysBefore, formatDate, toISODate } from '../dates';
import { useAccountDetail, useArchiveAccount, useNetWorth, useToday, useTransactions } from '../hooks';
import { useRupees } from '../privacy';
import { EditAccountSheet } from '../sheets/EditAccountSheet';
import { FormError } from '../sheets/Sheet';
import { accountAmount, kindLabel } from '../today/model';
import { CardError, EmptyState, Eyebrow, GhostChip, LightButton, Skeleton, TodayCard } from '../today/parts';
import { newestFirst } from '../transactions/model';
import { TxnRow } from '../transactions/TxnRow';
import { useTxnFlows } from '../transactions/useTxnFlows';
import type { Account } from '../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export function AccountScreen({ id }: { id: string }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'restoring') return null;
  if (status !== 'authenticated') return <Redirect href="/" />;
  return <AccountBody id={id} />;
}

/**
 * Spec 4.5 account screen: current balance; money received and spent this
 * month; recent transactions; month by month; details. Actions: Add
 * transaction (this account preset), Transfer, Update balance, Reconcile,
 * Edit account, Archive account.
 */
function AccountBody({ id }: { id: string }) {
  const router = useRouter();
  const theme = useArchetypeTheme();
  const formatRupees = useRupees();
  const today = useToday();
  const todayISO = toISODate(today);
  const detail = useAccountDetail(id, todayISO);
  const accounts = useNetWorth(todayISO).data?.accounts ?? [];
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const recent = useTransactions(daysBefore(today, 90), todayISO);
  const flows = useTxnFlows({ accounts, defaultDate: todayISO });
  const archive = useArchiveAccount();
  const [editing, setEditing] = useState<Account | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const d = detail.data;
  const account = d?.account;
  const rows = newestFirst(
    (recent.data ?? []).filter((t) => !t.deleted && (t.account_id === id || t.to_account_id === id)),
  ).slice(0, 10);

  const confirmArchive = (a: Account) => {
    setArchiveError(null);
    Alert.alert(
      `Archive ${a.name}?`,
      'It leaves your accounts list. Its history stays in your transactions. Only an account at ₹0 can be archived.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archive.mutateAsync({ id: a.id, today: todayISO });
              router.back();
            } catch (err) {
              setArchiveError(toErrorMessage(err, "Couldn't archive this account. Please try again."));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScreenScroll refreshing={detail.isRefetching} onRefresh={() => void Promise.all([detail.refetch(), recent.refetch()])}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
          style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: theme.accentText, fontWeight: '600' }}>‹ Back</Text>
        </TouchableOpacity>

        {!account ? (
          <TodayCard>
            {detail.isError ? (
              <CardError message="Couldn't load this account." onRetry={() => void detail.refetch()} />
            ) : (
              <Skeleton lines={[{ width: '50%', height: 24 }, { width: '70%', height: 36 }, { width: '100%', height: 40 }]} />
            )}
          </TodayCard>
        ) : (
          <>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 14, color: COLORS.muted }}>{kindLabel(account.kind)}</Text>
              <Text style={{ fontSize: 24, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>{account.name}</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 40, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600', marginTop: 6 }}>
                {accountAmount(account, formatRupees)}
              </Text>
            </View>

            <TodayCard title={<Eyebrow>THIS MONTH</Eyebrow>}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Figure label="Money received" value={formatRupees(d.money_in_this_month_paise)} />
                <Figure label="Money spent" value={formatRupees(d.money_out_this_month_paise)} />
              </View>
            </TodayCard>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <LightButton label="Add transaction" onPress={() => flows.openQuick(null, account.id)} />
              <GhostChip label="Transfer" onPress={() => flows.openQuick('transfer', account.id)} />
              <GhostChip label="Update balance" onPress={() => flows.openBalance(account.id)} />
              <GhostChip label="Reconcile" onPress={() => flows.openBalance(account.id, true)} />
            </View>

            <TodayCard
              title="Recent transactions"
              right={
                <TouchableOpacity accessibilityRole="button" onPress={() => router.push(`/transactions?account=${account.id}`)} hitSlop={10}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accentText }}>View all</Text>
                </TouchableOpacity>
              }>
              {!recent.data ? (
                recent.isError ? (
                  <CardError message="Couldn't load the transactions." onRetry={() => void recent.refetch()} />
                ) : (
                  <Skeleton lines={[{ width: '100%', height: 36 }, { width: '100%', height: 36 }]} />
                )
              ) : rows.length === 0 ? (
                <EmptyState text="Nothing on this account in the last 90 days." action="Add a transaction" onAction={() => flows.openQuick(null, account.id)} />
              ) : (
                <View>
                  {rows.map((t) => (
                    <TxnRow key={t.id} txn={t} accounts={byId} onPress={() => flows.openTxn(t)} />
                  ))}
                </View>
              )}
            </TodayCard>

            <TodayCard title="Month by month">
              {d.months.map((m) => (
                <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: COLORS.text }}>{monthName(m.month)}</Text>
                  {m.closing_paise === null ? (
                    <Text style={{ fontSize: 12.5, color: COLORS.muted }}>Before you added it</Text>
                  ) : (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>
                        {accountAmount({ ...account, balance_paise: m.closing_paise }, formatRupees)}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: COLORS.muted }}>
                        + {formatRupees(m.money_in_paise)} · − {formatRupees(m.money_out_paise)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </TodayCard>

            <TodayCard title="Account details">
              <Detail label="Type" value={kindLabel(account.kind)} />
              {account.bank ? <Detail label="Bank" value={bankBySlug(account.bank)?.name ?? account.bank} /> : null}
              <Detail label="Added" value={formatDate(account.created_at.slice(0, 10))} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <GhostChip label="Edit account" onPress={() => setEditing(account)} />
                <GhostChip label="Archive account" onPress={() => confirmArchive(account)} />
              </View>
              <FormError message={archiveError} />
            </TodayCard>
          </>
        )}
      </ScreenScroll>
      <EditAccountSheet account={editing} onClose={() => setEditing(null)} />
      {flows.elements}
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 12, color: COLORS.muted }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, color: COLORS.text, fontFamily: HEADING_FONT }}>
        {value}
      </Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' }}>
      <Text style={{ fontSize: 14, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontSize: 14, color: COLORS.text }}>{value}</Text>
    </View>
  );
}
