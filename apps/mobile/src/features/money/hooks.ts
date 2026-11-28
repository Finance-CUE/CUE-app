import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import * as moneyApi from '@/features/money/api';
import { toISODate } from '@/features/money/dates';

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

export const useKhata = () =>
  useQuery({ queryKey: ['money', 'khata'], queryFn: moneyApi.fetchKhata });

export const useSubscriptions = (today: string) =>
  useQuery({
    queryKey: ['money', 'subscriptions', today],
    queryFn: () => moneyApi.fetchSubscriptions(today),
  });

export const useDueSubscriptions = (today: string, enabled = true) =>
  useQuery({
    queryKey: ['money', 'subscriptions', 'due', today],
    queryFn: () => moneyApi.fetchDueSubscriptions(today),
    enabled,
  });

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

export const useLogSpend = () => useMoneyMutation(moneyApi.logSpend);
export const useUpdateSpend = () => useMoneyMutation(moneyApi.updateSpend);
export const useDeleteSpend = () => useMoneyMutation(moneyApi.deleteSpend);
export const useSetStartingMoney = () => useMoneyMutation(moneyApi.putStartingMoney);
export const useAddKhata = () => useMoneyMutation(moneyApi.addKhata);
export const useSettleKhata = () => useMoneyMutation(moneyApi.settleKhata);
export const useDeleteKhata = () => useMoneyMutation(moneyApi.deleteKhata);
export const useAddSubscription = () => useMoneyMutation(moneyApi.addSubscription);
export const useDeleteSubscription = () => useMoneyMutation(moneyApi.deleteSubscription);
export const useAnswerCycle = () =>
  useMoneyMutation(({ id, month, active }: { id: string; month: string; active: boolean }) =>
    moneyApi.answerCycle(id, { month, active }),
  );

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
