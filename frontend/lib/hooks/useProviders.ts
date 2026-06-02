import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getProvider,
  saveProvider,
  deleteProvider,
  testProvider,
  listSupportedProviders,
} from '@/lib/api/providers'

export function useProvider(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['provider', workspaceId],
    queryFn: () => getProvider(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

export function useSupportedProviders() {
  return useQuery({
    queryKey: ['providers', 'supported'],
    queryFn: listSupportedProviders,
    staleTime: Infinity,
  })
}

export function useSaveProvider(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof saveProvider>[1]) =>
      saveProvider(workspaceId!, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['provider', workspaceId] }),
  })
}

export function useDeleteProvider(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteProvider(workspaceId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['provider', workspaceId] }),
  })
}

export function useTestProvider(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: () => testProvider(workspaceId!),
  })
}
