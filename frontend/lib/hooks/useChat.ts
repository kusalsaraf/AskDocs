import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  updateConversationTitle,
  getMessageSources,
} from '@/lib/api/chat'
import {
  adaptConversationSummary,
  adaptConversation,
} from '@/lib/types/domain'

export function useConversations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', workspaceId],
    queryFn: async () =>
      (await listConversations(workspaceId!)).map(adaptConversationSummary),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}

export function useConversation(
  workspaceId: string | undefined,
  conversationId: string | undefined
) {
  return useQuery({
    queryKey: ['conversation', workspaceId, conversationId],
    queryFn: async () =>
      adaptConversation(await getConversation(workspaceId!, conversationId!)),
    enabled: !!workspaceId && !!conversationId,
    staleTime: 30_000,
  })
}

export function useCreateConversation(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createConversation(workspaceId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] }),
  })
}

export function useDeleteConversation(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      deleteConversation(workspaceId!, conversationId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] }),
  })
}

export function useUpdateTitle(
  workspaceId: string | undefined,
  conversationId: string | undefined
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      updateConversationTitle(workspaceId!, conversationId!, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
      queryClient.invalidateQueries({
        queryKey: ['conversation', workspaceId, conversationId],
      })
    },
  })
}

export function useMessageSources(
  workspaceId: string | undefined,
  conversationId: string | undefined,
  messageId: string | undefined
) {
  return useQuery({
    queryKey: ['sources', workspaceId, conversationId, messageId],
    queryFn: () => getMessageSources(workspaceId!, conversationId!, messageId!),
    enabled: !!workspaceId && !!conversationId && !!messageId,
    staleTime: Infinity,
  })
}
