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
  PaymentMethod,
  KhataEntry,
  KhataInput,
  MoneySummary,
  Nudges,
  PlannedNudge,
  Spend,
  TrendPoint,
  CashFlow,
  CashFlowPeriod,
  MonthPoint,
  MonthSummary,
  NetWorthHistory,
  Occurrence,
  PayInput,
  Position,
  Schedule,
  ScheduleInput,
  Jar,
  JarDetail,
  JarInput,
  JarMove,
  Jars,
  Group,
  GroupDetail,
  GroupExpense,
  GroupExpenseInput,
  Groups,
  GroupSettlement,
  GroupSettlementInput,
  PersonSettleInput,
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

/** Ledger entries dated start..end (inclusive, at most a year). `recurring` keeps
 * only entries that belong to a scheduled item. */
export async function fetchTransactions(start: string, end: string, recurring = false): Promise<LedgerTxn[]> {
  const result = await api.get<LedgerTxn[]>('/money/transactions', {
    params: recurring ? { start, end, recurring: true } : { start, end },
  });
  return result.data;
}

export async function deleteKhata(id: string): Promise<void> {
  await api.delete(`/money/khata/${id}`);
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

// P1: scheduled payments and recurring income (spec 4.8) --------------------------

/** Active items, soonest next due first. */
export async function fetchScheduled(today: string): Promise<Schedule[]> {
  return (await api.get<Schedule[]>('/money/scheduled', { params: { today } })).data;
}

/** A retry with the same client key returns the item already made. */
export async function addScheduled({
  today,
  ...input
}: ScheduleInput & { client_key: string; today: string }): Promise<Schedule> {
  return (await api.post<Schedule>('/money/scheduled', input, { params: { today } })).data;
}

export async function updateScheduled({ id, today, ...input }: ScheduleInput & { id: string; today: string }): Promise<Schedule> {
  return (await api.patch<Schedule>(`/money/scheduled/${id}`, input, { params: { today } })).data;
}

/** Stops future dues; payments already recorded stay. */
export async function cancelScheduled(id: string): Promise<void> {
  await api.post(`/money/scheduled/${id}/cancel`);
}

/** Due dates start..end with their status; openBefore adds unanswered earlier ones. */
export async function fetchDues(start: string, end: string, openBefore = false): Promise<Occurrence[]> {
  const params = openBefore ? { start, end, open_before: true } : { start, end };
  return (await api.get<Occurrence[]>('/money/dues', { params })).data;
}

/** Mark paid (or received): records the expense or income. */
export async function payScheduled({ id, today, ...input }: PayInput & { id: string; today: string }): Promise<LedgerTxn> {
  return (await api.post<LedgerTxn>(`/money/scheduled/${id}/pay`, input, { params: { today } })).data;
}

/** Skip this due date only. */
export async function skipScheduled({ id, due_on }: { id: string; due_on: string }): Promise<void> {
  await api.post(`/money/scheduled/${id}/skip`, { due_on });
}

/** Undo a Skip. */
export async function unskipScheduled({ id, due_on }: { id: string; due_on: string }): Promise<void> {
  await api.post(`/money/scheduled/${id}/unskip`, { due_on });
}

// P1: money in and out --------------------------------------------------------------

export async function fetchMonth(today: string): Promise<MonthSummary> {
  return (await api.get<MonthSummary>('/money/month', { params: { today } })).data;
}

/** The last `count` months, oldest first. */
export async function fetchMonths(today: string, count = 6): Promise<MonthPoint[]> {
  return (await api.get<MonthPoint[]>('/money/months', { params: { today, count } })).data;
}

export async function fetchCashFlow(period: CashFlowPeriod, on: string, today: string): Promise<CashFlow> {
  return (await api.get<CashFlow>('/money/cash-flow', { params: { period, on, today } })).data;
}

export async function fetchNetWorthHistory(today: string, days: number): Promise<NetWorthHistory> {
  return (await api.get<NetWorthHistory>('/money/net-worth/history', { params: { today, days } })).data;
}

/** "Your position on <date>". */
export async function fetchPosition(on: string): Promise<Position> {
  return (await api.get<Position>('/money/position', { params: { on } })).data;
}

// P2: Goal Jars ---------------------------------------------------------------------

export async function fetchJars(today: string): Promise<Jars> {
  return (await api.get<Jars>('/money/jars', { params: { today } })).data;
}

export async function fetchJar(id: string, today: string): Promise<JarDetail> {
  return (await api.get<JarDetail>(`/money/jars/${id}`, { params: { today } })).data;
}

/** Create jar with an optional first contribution. A retry returns the jar already made. */
export async function createJar({
  today,
  ...input
}: JarInput & { client_key: string; initial_paise: number; today: string }): Promise<Jar> {
  return (await api.post<Jar>('/money/jars', input, { params: { today } })).data;
}

export async function updateJar({ id, today, ...input }: JarInput & { id: string; today: string }): Promise<Jar> {
  return (await api.patch<Jar>(`/money/jars/${id}`, input, { params: { today } })).data;
}

/** Add money or Withdraw: only the allocation moves. */
export async function moveJar({
  id,
  action,
  today,
  ...input
}: {
  id: string;
  action: 'add' | 'withdraw';
  today: string;
  client_key: string;
  amount_paise: number;
  occurred_on: string;
  note?: string | null;
}): Promise<JarMove> {
  return (await api.post<JarMove>(`/money/jars/${id}/${action}`, input, { params: { today } })).data;
}

/** Undo an add or withdrawal. */
export async function undoJarMove({ id, today }: { id: string; today: string }): Promise<JarMove> {
  return (await api.delete<JarMove>(`/money/jars/moves/${id}`, { params: { today } })).data;
}

export async function answerContribution({
  id,
  today,
  ...input
}: {
  id: string;
  today: string;
  client_key: string;
  due_on: string;
  approve: boolean;
}): Promise<void> {
  await api.post(`/money/jars/${id}/contribution`, input, { params: { today } });
}

/** Pause, Resume, Complete, Archive, or "the celebration was shown". */
export async function jarAction({
  id,
  action,
  today,
}: {
  id: string;
  action: 'pause' | 'resume' | 'complete' | 'archive' | 'celebrated';
  today: string;
}): Promise<void> {
  await api.post(`/money/jars/${id}/${action}`, undefined, { params: { today } });
}

// P3: shared money ----------------------------------------------------------------------

/** A part (or full) payment with one person. 409 when it is more than is open and allow_over is off. */
export async function settlePerson(input: PersonSettleInput): Promise<void> {
  await api.post('/money/khata/settle-person', input);
}

export async function fetchGroups(): Promise<Groups> {
  return (await api.get<Groups>('/money/groups')).data;
}

export async function fetchGroup(id: string): Promise<GroupDetail> {
  return (await api.get<GroupDetail>(`/money/groups/${id}`)).data;
}

export async function createGroup(input: { client_key: string; name: string; icon: string; members: string[] }): Promise<Group> {
  return (await api.post<Group>('/money/groups', input)).data;
}

export async function updateGroup({
  id,
  ...input
}: {
  id: string;
  name: string;
  icon: string;
  add_members: string[];
  remove_members: string[];
}): Promise<Group> {
  return (await api.patch<Group>(`/money/groups/${id}`, input)).data;
}

export async function archiveGroup(id: string): Promise<void> {
  await api.post(`/money/groups/${id}/archive`);
}

export async function addGroupExpense({
  groupId,
  today,
  ...input
}: GroupExpenseInput & { groupId: string; today: string }): Promise<GroupExpense> {
  return (await api.post<GroupExpense>(`/money/groups/${groupId}/expenses`, input, { params: { today } })).data;
}

export async function editGroupExpense({
  id,
  today,
  ...input
}: GroupExpenseInput & { id: string; today: string }): Promise<GroupExpense> {
  return (await api.put<GroupExpense>(`/money/groups/expenses/${id}`, input, { params: { today } })).data;
}

/** Delete (or Undo with restore) a group expense or settlement. */
export async function setGroupEntryDeleted({
  kind,
  id,
  deleted,
}: {
  kind: 'expenses' | 'settlements';
  id: string;
  deleted: boolean;
}): Promise<void> {
  if (deleted) await api.delete(`/money/groups/${kind}/${id}`);
  else await api.post(`/money/groups/${kind}/${id}/restore`);
}

export async function addGroupSettlement({
  groupId,
  today,
  ...input
}: GroupSettlementInput & { groupId: string; today: string }): Promise<GroupSettlement> {
  return (await api.post<GroupSettlement>(`/money/groups/${groupId}/settlements`, input, { params: { today } })).data;
}

// P4: intelligence --------------------------------------------------------------------------

export async function fetchNote(today: string): Promise<import('./types').NoteResponse> {
  return (await api.get('/money/note', { params: { today } })).data;
}

export async function dismissNote({ key, today }: { key: string; today: string }): Promise<void> {
  await api.post('/money/note/dismiss', { key }, { params: { today } });
}

/** Ask CUE: an answer from your own data, or a filled form to check. Never saves. */
export async function askCue({ query, today }: { query: string; today: string }): Promise<import('./types').AskReply> {
  return (await api.post('/money/ask', { query }, { params: { today } })).data;
}

export async function fetchMerchantCategories(): Promise<import('./types').MerchantCategory[]> {
  return (await api.get('/money/merchant-categories')).data;
}

/** Long-press fix (suggestion 18); remember applies it to the merchant from now on. */
export async function fixCategory({ id, category, remember }: { id: string; category: string; remember: boolean }): Promise<LedgerTxn> {
  return (await api.post<LedgerTxn>(`/money/transactions/${id}/category`, { category, remember })).data;
}
