import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as moneyApi from '@/features/money/api';

export const useSpends = (start: string, end: string) =>
  useQuery({
    queryKey: ['money', 'spends', start, end],
    queryFn: () => moneyApi.fetchSpends(start, end),
  });

export const useSummary = () =>
  useQuery({ queryKey: ['money', 'summary'], queryFn: moneyApi.fetchSummary });

export const useKhata = () =>
  useQuery({ queryKey: ['money', 'khata'], queryFn: moneyApi.fetchKhata });

export const useSubscriptions = (today: string) =>
  useQuery({
    queryKey: ['money', 'subscriptions', today],
    queryFn: () => moneyApi.fetchSubscriptions(today),
  });

export const useAssets = () =>
  useQuery({ queryKey: ['money', 'assets'], queryFn: moneyApi.fetchAssets });

export const useNudges = () =>
  useQuery({ queryKey: ['profile', 'nudges'], queryFn: moneyApi.fetchNudges });

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
export const useDeleteSpend = () => useMoneyMutation(moneyApi.deleteSpend);
export const useSetStartingMoney = () => useMoneyMutation(moneyApi.putStartingMoney);
export const useAddKhata = () => useMoneyMutation(moneyApi.addKhata);
export const useSettleKhata = () => useMoneyMutation(moneyApi.settleKhata);
export const useDeleteKhata = () => useMoneyMutation(moneyApi.deleteKhata);
export const useAddSubscription = () => useMoneyMutation(moneyApi.addSubscription);
export const useDeleteSubscription = () => useMoneyMutation(moneyApi.deleteSubscription);
export const useAddAsset = () => useMoneyMutation(moneyApi.addAsset);
export const useDeleteAsset = () => useMoneyMutation(moneyApi.deleteAsset);

export function useSaveNudges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: moneyApi.putNudges,
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'nudges'] }),
  });
}
