import { apiClient } from './client'
import { getAccessToken } from './auth'
import { parseSSEStream } from '@/lib/utils/sse'
import type {
  ApiConversationSummary,
  ApiConversation,
  ApiChunkSource,
  ApiQuota,
  SSEEvent,
} from '@/lib/types/api'

export async function listConversations(
  workspaceId: string
): Promise<ApiConversationSummary[]> {
  const { data } = await apiClient.get<{ results: ApiConversationSummary[] }>(
    `/workspaces/${workspaceId}/conversations/`
  )
  return data.results
}

export async function createConversation(
  workspaceId: string
): Promise<ApiConversationSummary> {
  const { data } = await apiClient.post<ApiConversationSummary>(
    `/workspaces/${workspaceId}/conversations/`,
    {}
  )
  return data
}

export async function getConversation(
  workspaceId: string,
  conversationId: string
): Promise<ApiConversation> {
  const { data } = await apiClient.get<ApiConversation>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/`
  )
  return data
}

export async function deleteConversation(
  workspaceId: string,
  conversationId: string
): Promise<void> {
  await apiClient.delete(
    `/workspaces/${workspaceId}/conversations/${conversationId}/`
  )
}

export async function updateConversationTitle(
  workspaceId: string,
  conversationId: string,
  title: string
): Promise<void> {
  await apiClient.patch(
    `/workspaces/${workspaceId}/conversations/${conversationId}/`,
    { title }
  )
}

export async function getMessageSources(
  workspaceId: string,
  conversationId: string,
  messageId: string
): Promise<ApiChunkSource[]> {
  const { data } = await apiClient.get<ApiChunkSource[]>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/sources/`
  )
  return data
}

export async function getQuota(workspaceId: string): Promise<ApiQuota> {
  const { data } = await apiClient.get<ApiQuota>(
    `/workspaces/${workspaceId}/chat/quota/`
  )
  return data
}

// Streaming send — yields SSEEvents as they arrive via native fetch
export async function* sendMessageStream(
  workspaceId: string,
  conversationId: string,
  content: string,
  topK = 5
): AsyncGenerator<SSEEvent> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'
  const token = getAccessToken()

  const res = await fetch(
    `${baseUrl}/workspaces/${workspaceId}/conversations/${conversationId}/messages/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, top_k: topK }),
    }
  )

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.body) throw new Error('No response body')

  yield* parseSSEStream(res.body)
}
