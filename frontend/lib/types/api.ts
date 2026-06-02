// Exact shapes returned by the Django backend at /api/v1/

export interface ApiUser {
  id: string
  email: string
  first_name: string
  last_name: string
  display_name: string
  avatar_url: string | null
}

export interface ApiWorkspace {
  id: string
  name: string
  slug: string
  is_personal: boolean
  role: 'admin' | 'member' | 'viewer'
  member_count: number
  created_at: string
}

export interface MeResponse {
  user: ApiUser
  workspaces: ApiWorkspace[]
}

export interface TokenPair {
  access: string
  refresh: string
}

export type ApiDocumentStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface ApiDocument {
  id: string
  filename: string
  file_size_bytes: number
  mime_type: string
  status: ApiDocumentStatus
  error_message: string
  uploaded_by: Pick<ApiUser, 'id' | 'display_name'> | null
  created_at: string
  updated_at: string
}

export interface ApiProviderConfig {
  provider_name: string
  model_name: string
  api_key_last_4: string
  base_url: string | null
  azure_region: string | null
  temperature: number
  max_tokens: number
  last_test_status: 'ok' | 'error' | 'untested'
  last_tested_at: string | null
  last_test_error: string
}

export interface ApiPlatformDefault {
  using_platform_default: true
}

export type ApiProviderResponse = ApiProviderConfig | ApiPlatformDefault

export interface ApiSupportedProvider {
  name: string
  display_name: string
  requires_api_key: boolean
  supports_base_url: boolean
  default_model: string
  available_models: string[]
}

export interface ApiTestConnectionResult {
  success: boolean
  latency_ms: number
  model_echo: string
  error: string | null
}

export interface ApiConversationSummary {
  id: string
  title: string
  last_message_at: string
  message_count: number
}

export interface ApiCitation {
  index: number
  chunk_id: string
  document_id: string
  document_filename: string
  page_number: number | null
  score: number
}

export interface ApiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: ApiCitation[]
  is_cached: boolean
  created_at: string
}

export interface ApiConversation {
  id: string
  title: string
  is_pinned: boolean
  last_message_at: string
  created_at: string
  updated_at: string
  messages: ApiMessage[]
}

export interface ApiMember {
  user_id: string
  display_name: string
  email: string
  avatar_url: string | null
  role: 'admin' | 'member' | 'viewer'
  joined_at: string
}

export interface ApiPendingInvitation {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  created_at: string
}

export interface ApiQuota {
  user_limit: number
  user_used: number
  user_remaining: number
}

export interface ApiChunkSource {
  chunk_id: string
  document_id: string
  document_filename: string
  page_number: number | null
  excerpt: string
  score: number
}

// SSE event types from the streaming endpoint
export type SSEEvent =
  | { type: 'token';    delta: string }
  | { type: 'complete'; message_id: string; citations: Record<string, string>; is_cached: boolean }
  | { type: 'error';    code: string; message: string }
