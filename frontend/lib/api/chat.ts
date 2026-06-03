import { apiClient } from './client'
import { getAccessToken, getRefreshToken, setTokens } from './auth'
import { parseSSEStream } from '@/lib/utils/sse'
import {
  API_BASE_URL,
  JWT_REFRESH_BUFFER_MS,
  DEFAULT_TOP_K,
  ERROR_CODES,
} from '@/lib/constants'
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
async function ensureFreshToken(): Promise<string | null> {
  const token = getAccessToken()
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const expiresAt = payload.exp * 1000
      if (Date.now() < expiresAt - JWT_REFRESH_BUFFER_MS) return token
    } catch {
      // Token parsing failed, try refresh
    }
  }

  const refresh = getRefreshToken()
  if (!refresh) return null

  const baseUrl = API_BASE_URL
  try {
    const res = await fetch(`${baseUrl}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
    if (!res.ok) return null
    const data = await res.json()
    setTokens(data.access, data.refresh)
    return data.access
  } catch {
    return null
  }
}

export async function* sendMessageStream(
  workspaceId: string,
  conversationId: string,
  content: string,
  topK = DEFAULT_TOP_K
): AsyncGenerator<SSEEvent> {
  const baseUrl = API_BASE_URL
  const token = await ensureFreshToken()

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

  if (!res.ok) {
    if (res.status === 429) throw new Error(ERROR_CODES.RATE_LIMIT)
    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.href = '/sign-in'
      throw new Error(ERROR_CODES.AUTH_EXPIRED)
    }
    throw new Error(`HTTP ${res.status}`)
  }
  if (!res.body) throw new Error('No response body')

  yield* parseSSEStream(res.body)
}
