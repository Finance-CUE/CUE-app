import { deviceTimeZone } from '@/features/money/dates';
import { api } from '@/lib/api';
import type {
  CycleAnswer,
  DueCycle,
  KhataEntry,
  KhataInput,
  MoneySummary,
  Nudges,
  PlannedNudge,
  Spend,
  SpendInput,
  StartingMoney,
  StartingMoneyInput,
  Subscription,
  SubscriptionInput,
  TrendPoint,
} from '@/features/money/types';

export async function fetchSpends(start: string, end: string): Promise<Spend[]> {
  const result = await api.get<Spend[]>('/money/spends', { params: { start, end } });
  return result.data;
}

export async function logSpend(input: SpendInput): Promise<Spend> {
  const result = await api.post<Spend>('/money/spends', input);
  return result.data;
}

export async function deleteSpend(id: string): Promise<void> {
  await api.delete(`/money/spends/${id}`);
}

export async function fetchSummary(): Promise<MoneySummary> {
  const result = await api.get<MoneySummary>('/money/summary');
  return result.data;
}

export async function putStartingMoney(input: StartingMoneyInput): Promise<StartingMoney> {
  const result = await api.put<StartingMoney>('/money/starting-money', input);
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

export async function settleKhata(id: string): Promise<void> {
  await api.post(`/money/khata/${id}/settle`);
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
