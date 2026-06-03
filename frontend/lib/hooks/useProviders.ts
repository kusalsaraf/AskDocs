import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getProvider,
  saveProvider,
  deleteProvider,
  testProvider,
  listSupportedProviders,
} from '@/lib/api/providers'
import { queryKeys } from '@/lib/constants'

export function useProvider(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.provider(workspaceId),
    queryFn: () => getProvider(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
    retry: (failureCount: number, error: Error) => {
      if (isAxiosError(error) && error.response?.status === 403) return false
      return failureCount < 3
    },
  })
}

export function useSupportedProviders() {
  return useQuery({
    queryKey: queryKeys.supportedProviders(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.provider(workspaceId) }),
  })
}

export function useDeleteProvider(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteProvider(workspaceId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.provider(workspaceId) }),
  })
}

export function useTestProvider(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: (payload: Parameters<typeof testProvider>[1]) =>
      testProvider(workspaceId!, payload),
  })
}
