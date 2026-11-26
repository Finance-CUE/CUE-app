import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import * as moneyApi from '@/features/money/api';
import { toISODate } from '@/features/money/dates';
import type { CashFlowPeriod } from '@/features/money/types';

/**
 * The current date, moved on when the app resumes on a new local calendar day.
 * Tab screens stay mounted, and React Compiler can freeze a `new Date()` made
 * during render. The time of day is whenever the day last changed: do not read it.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const now = new Date();
      setToday((prev) => (toISODate(prev) === toISODate(now) ? prev : now));
    });
    return () => sub.remove();
  }, []);
  return today;
}

export const useSpends = (start: string, end: string) =>
  useQuery({
    queryKey: ['money', 'spends', start, end],
    queryFn: () => moneyApi.fetchSpends(start, end),
  });

export const useSummary = (enabled = true) =>
  useQuery({ queryKey: ['money', 'summary'], queryFn: moneyApi.fetchSummary, enabled });

export const useAccounts = (today: string, enabled = true) =>
  useQuery({
    queryKey: ['money', 'accounts', today],
    queryFn: () => moneyApi.fetchAccounts(today),
    enabled,
  });

export const useAccountDetail = (id: string, today: string) =>
  useQuery({
    queryKey: ['money', 'account', id, today],
    queryFn: () => moneyApi.fetchAccountDetail(id, today),
  });

export const useNetWorth = (today: string) =>
  useQuery({ queryKey: ['money', 'net-worth', today], queryFn: () => moneyApi.fetchNetWorth(today) });

export const useTransactions = (start: string, end: string, enabled = true, recurring = false) =>
  useQuery({
    queryKey: ['money', 'transactions', start, end, recurring],
    queryFn: () => moneyApi.fetchTransactions(start, end, recurring),
    enabled,
  });

// P1 ------------------------------------------------------------------------------

export const useScheduled = (today: string) =>
  useQuery({ queryKey: ['money', 'scheduled', today], queryFn: () => moneyApi.fetchScheduled(today) });

export const useDues = (start: string, end: string, openBefore = false, enabled = true) =>
  useQuery({
    queryKey: ['money', 'dues', start, end, openBefore],
    queryFn: () => moneyApi.fetchDues(start, end, openBefore),
    enabled,
  });

export const useMonth = (today: string) =>
  useQuery({ queryKey: ['money', 'month', today], queryFn: () => moneyApi.fetchMonth(today) });

export const useMonths = (today: string, count = 6) =>
  useQuery({ queryKey: ['money', 'months', today, count], queryFn: () => moneyApi.fetchMonths(today, count) });

export const useCashFlow = (period: CashFlowPeriod, on: string, today: string) =>
  useQuery({
    queryKey: ['money', 'cash-flow', period, on, today],
    queryFn: () => moneyApi.fetchCashFlow(period, on, today),
    // Switching tabs keeps the last chart on screen instead of blanking it.
    placeholderData: (prev) => prev,
  });

export const useNetWorthHistory = (today: string, days: number) =>
  useQuery({
    queryKey: ['money', 'net-worth-history', today, days],
    queryFn: () => moneyApi.fetchNetWorthHistory(today, days),
    placeholderData: (prev) => prev,
  });

export const usePosition = (on: string | null) =>
  useQuery({
    queryKey: ['money', 'position', on],
    queryFn: () => moneyApi.fetchPosition(on ?? ''),
    enabled: on !== null,
  });

/** True once `pending` has lasted `ms`: the server may be waking from sleep (spec, states). */
export function useSlow(pending: boolean, ms = 6000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [pending, ms]);
  return slow;
}

export const useKhata = () =>
  useQuery({ queryKey: ['money', 'khata'], queryFn: moneyApi.fetchKhata });

export const useTrend = (today: string) =>
  useQuery({ queryKey: ['money', 'trend', today], queryFn: () => moneyApi.fetchTrend(today) });

export const useNudges = () =>
  useQuery({ queryKey: ['profile', 'nudges'], queryFn: moneyApi.fetchNudges });

export const useNudgePlan = (enabled = true) =>
  useQuery({ queryKey: ['money', 'nudge-plan'], queryFn: moneyApi.fetchNudgePlan, enabled });

/** retry: 0 so a timeout never silently double-posts; success refreshes all money data. */
function useMoneyMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['money'] }),
  });
}

export const useAddKhata = () => useMoneyMutation(moneyApi.addKhata);
export const useAddAccount = () => useMoneyMutation(moneyApi.addAccount);
export const useUpdateAccount = () => useMoneyMutation(moneyApi.updateAccount);
export const useArchiveAccount = () => useMoneyMutation(moneyApi.archiveAccount);
export const useAdjustBalance = () => useMoneyMutation(moneyApi.adjustBalance);
export const useAddTransaction = () => useMoneyMutation(moneyApi.addTransaction);
export const useDeleteTransaction = () => useMoneyMutation(moneyApi.deleteTransaction);
export const useUpdateTransaction = () => useMoneyMutation(moneyApi.updateTransaction);
export const useRestoreTransaction = () => useMoneyMutation(moneyApi.restoreTransaction);
export const useSettleKhata = () => useMoneyMutation(moneyApi.settleKhata);
export const useDeleteKhata = () => useMoneyMutation(moneyApi.deleteKhata);
export const useAddScheduled = () => useMoneyMutation(moneyApi.addScheduled);
export const useUpdateScheduled = () => useMoneyMutation(moneyApi.updateScheduled);
export const useCancelScheduled = () => useMoneyMutation(moneyApi.cancelScheduled);
export const usePayScheduled = () => useMoneyMutation(moneyApi.payScheduled);
export const useSkipScheduled = () => useMoneyMutation(moneyApi.skipScheduled);
export const useUnskipScheduled = () => useMoneyMutation(moneyApi.unskipScheduled);

export function useSaveNudges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: moneyApi.putNudges,
    retry: 0,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', 'nudges'] }),
        queryClient.invalidateQueries({ queryKey: ['money', 'nudge-plan'] }),
      ]),
  });
}
