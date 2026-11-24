import { deviceTimeZone } from '@/features/money/dates';
import { api } from '@/lib/api';
import type {
  Account,
  AccountDetail,
  AccountInput,
  AccountUpdate,
  AdjustInput,
  EntryInput,
  EntryUpdate,
  LedgerTxn,
  NetWorth,
  CycleAnswer,
  PaymentMethod,
  DueCycle,
  KhataEntry,
  KhataInput,
  MoneySummary,
  Nudges,
  PlannedNudge,
  Spend,
  Subscription,
  SubscriptionInput,
  TrendPoint,
} from '@/features/money/types';

export async function fetchSpends(start: string, end: string): Promise<Spend[]> {
  const result = await api.get<Spend[]>('/money/spends', { params: { start, end } });
  return result.data;
}

export async function fetchSummary(): Promise<MoneySummary> {
  const result = await api.get<MoneySummary>('/money/summary');
  return result.data;
}

export async function fetchKhata(): Promise<KhataEntry[]> {
  const result = await api.get<KhataEntry[]>('/money/khata');
  return result.data;
}

export async function addKhata(input: KhataInput): Promise<KhataEntry> {
  const result = await api.post<KhataEntry>('/money/khata', input);
  return result.data;
}

/** Settles an entry. `method` says how the money moved: cash uses Cash, UPI the bank account. */
export async function settleKhata({ id, method }: { id: string; method?: PaymentMethod }): Promise<void> {
  await api.post(`/money/khata/${id}/settle`, method ? { method } : {});
}

/** Open accounts with today's balance, largest first, cash last, cards after. */
export async function fetchAccounts(today: string): Promise<Account[]> {
  const result = await api.get<Account[]>('/money/accounts', { params: { today } });
  return result.data;
}

/** The account screen: balance, this month's in and out, six months of history. */
export async function fetchAccountDetail(id: string, today: string): Promise<AccountDetail> {
  const result = await api.get<AccountDetail>(`/money/accounts/${id}`, { params: { today } });
  return result.data;
}

export async function updateAccount({ id, today, ...input }: AccountUpdate & { id: string; today: string }): Promise<Account> {
  const result = await api.patch<Account>(`/money/accounts/${id}`, input, { params: { today } });
  return result.data;
}

/** Only at ₹0; the server refuses otherwise (409) with the reason. */
export async function archiveAccount({ id, today }: { id: string; today: string }): Promise<void> {
  await api.post(`/money/accounts/${id}/archive`, undefined, { params: { today } });
}

export async function addAccount({ today, ...input }: AccountInput & { today: string }): Promise<Account> {
  const result = await api.post<Account>('/money/accounts', input, { params: { today } });
  return result.data;
}

/** Update balance / Reconcile. Null when the balance already matched (nothing saved). */
export async function adjustBalance({
  id,
  today,
  ...input
}: AdjustInput & { id: string; today: string }): Promise<LedgerTxn | null> {
  const result = await api.post<LedgerTxn | ''>(`/money/accounts/${id}/adjust`, input, { params: { today } });
  return result.status === 204 || !result.data ? null : result.data;
}

/** The net worth card and breakdown, worked out on the server. */
export async function fetchNetWorth(today: string): Promise<NetWorth> {
  const result = await api.get<NetWorth>('/money/net-worth', { params: { today } });
  return result.data;
}

/** Quick Add. A retry with the same client key returns the entry already saved. */
export async function addTransaction(input: EntryInput): Promise<LedgerTxn> {
  const result = await api.post<LedgerTxn>('/money/transactions', input);
  return result.data;
}

/** Edit any date; a new date or account moves the entry's effect on the server. */
export async function updateTransaction({ id, ...input }: EntryUpdate & { id: string }): Promise<LedgerTxn> {
  const result = await api.patch<LedgerTxn>(`/money/transactions/${id}`, input);
  return result.data;
}

/** Undo a delete. */
export async function restoreTransaction(id: string): Promise<LedgerTxn> {
  const result = await api.post<LedgerTxn>(`/money/transactions/${id}/restore`);
  return result.data;
}

/** Deleted but kept, so it can be restored. Undo after a save uses this too. */
export async function deleteTransaction(id: string): Promise<LedgerTxn> {
  const result = await api.delete<LedgerTxn>(`/money/transactions/${id}`);
  return result.data;
}

/** Ledger entries dated start..end (inclusive, at most a year). */
export async function fetchTransactions(start: string, end: string): Promise<LedgerTxn[]> {
  const result = await api.get<LedgerTxn[]>('/money/transactions', { params: { start, end } });
  return result.data;
}

export async function deleteKhata(id: string): Promise<void> {
  await api.delete(`/money/khata/${id}`);
}

export async function fetchSubscriptions(today: string): Promise<Subscription[]> {
  const result = await api.get<Subscription[]>('/money/subscriptions', { params: { today } });
  return result.data;
}

export async function addSubscription(input: SubscriptionInput): Promise<Subscription> {
  const result = await api.post<Subscription>('/money/subscriptions', input);
  return result.data;
}

export async function deleteSubscription(id: string): Promise<void> {
  await api.delete(`/money/subscriptions/${id}`);
}

export async function fetchDueSubscriptions(today: string): Promise<DueCycle[]> {
  const result = await api.get<DueCycle[]>('/money/subscriptions/due', { params: { today } });
  return result.data;
}

export async function answerCycle(id: string, answer: CycleAnswer): Promise<void> {
  await api.post(`/money/subscriptions/${id}/cycles`, answer);
}

/** Retry once without `tz` when the server rejects the device zone (422). */
async function getWithTz<T>(url: string, params: Record<string, string>): Promise<T> {
  try {
    return (await api.get<T>(url, { params: { ...params, tz: deviceTimeZone() } })).data;
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status !== 422) throw err;
    return (await api.get<T>(url, { params })).data;
  }
}

export const fetchTrend = (today: string): Promise<TrendPoint[]> =>
  getWithTz<TrendPoint[]>('/profile/trend', { today });

export async function fetchNudges(): Promise<Nudges> {
  const result = await api.get<Nudges>('/profile/nudges');
  return result.data;
}

export const fetchNudgePlan = (): Promise<PlannedNudge[]> =>
  getWithTz<PlannedNudge[]>('/profile/nudges/plan', {});

export async function putNudges(nudges: Nudges): Promise<Nudges> {
  const result = await api.put<Nudges>('/profile/nudges', nudges);
  return result.data;
}
