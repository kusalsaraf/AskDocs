import type {
  ApiUser,
  ApiWorkspace,
  ApiDocument,
  ApiDocumentStatus,
  ApiCitation,
  ApiMessage,
  ApiConversation,
  ApiConversationSummary,
  ApiProviderConfig,
  ApiMember,
  ApiPendingInvitation,
} from './api'

// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string           // display_name from backend
  email: string
  avatarInitials: string // computed from first_name + last_name
  role: 'admin' | 'member' | 'viewer'
}

export function adaptUser(api: ApiUser, role: 'admin' | 'member' | 'viewer' = 'member'): User {
  const initials = (
    (api.first_name?.[0] ?? '') + (api.last_name?.[0] ?? '')
  ).toUpperCase() || api.email[0].toUpperCase()
  return {
    id: api.id,
    name: api.display_name || `${api.first_name} ${api.last_name}`.trim() || api.email,
    email: api.email,
    avatarInitials: initials,
    role,
  }
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  slug: string
  is_personal: boolean
  logoInitials: string   // computed from name
  memberCount: number
  role: 'admin' | 'member' | 'viewer'
}

export function adaptWorkspace(api: ApiWorkspace): Workspace {
  return {
    id: api.id,
    name: api.name,
    slug: api.slug,
    is_personal: api.is_personal,
    logoInitials: api.name.substring(0, 2).toUpperCase(),
    memberCount: api.member_count,
    role: api.role,
  }
}

// ── Document ──────────────────────────────────────────────────────────────────

export type DocumentStatus = ApiDocumentStatus // 'pending' | 'processing' | 'ready' | 'failed'
export type DocumentType = 'pdf' | 'docx' | 'txt' | 'md' | 'unknown'

export interface Document {
  id: string
  name: string           // filename
  type: DocumentType
  size: number           // file_size_bytes
  uploadedAt: Date       // created_at
  uploadedBy: { id: string; name: string }
  status: DocumentStatus
  errorMessage: string
}

function inferType(filename: string): DocumentType {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf')  return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'txt')  return 'txt'
  if (ext === 'md')   return 'md'
  return 'unknown'
}

export function adaptDocument(api: ApiDocument): Document {
  return {
    id: api.id,
    name: api.filename,
    type: inferType(api.filename),
    size: api.file_size_bytes,
    uploadedAt: new Date(api.created_at),
    uploadedBy: { id: api.uploaded_by?.id ?? '', name: api.uploaded_by?.display_name ?? 'Unknown' },
    status: api.status,
    errorMessage: api.error_message,
  }
}

// ── Citation ──────────────────────────────────────────────────────────────────

export interface Citation {
  id: number             // citation index as shown in [N] markers
  chunkId: string
  documentId: string
  documentName: string
  excerpt: string
  pageNumber: number | null
}

export function adaptCitation(api: ApiCitation): Citation {
  return {
    id: api.index,
    chunkId: api.chunk_id,
    documentId: api.document_id,
    documentName: api.document_filename,
    excerpt: '',
    pageNumber: api.page_number,
  }
}

// ── Messages & Conversations ──────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  role: MessageRole
  content: string
  citations: Citation[]
  createdAt: Date
  isStreaming?: boolean
  streamError?: string
}

export function adaptMessage(api: ApiMessage): Message {
  return {
    id: api.id,
    role: api.role,
    content: api.content,
    citations: api.citations.map(adaptCitation),
    createdAt: new Date(api.created_at),
  }
}

export interface ConversationSummary {
  id: string
  title: string
  lastMessage: string
  updatedAt: Date
}

export function adaptConversationSummary(api: ApiConversationSummary): ConversationSummary {
  return {
    id: api.id,
    title: api.title,
    lastMessage: '',
    updatedAt: new Date(api.last_message_at),
  }
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

export function adaptConversation(api: ApiConversation): Conversation {
  return {
    id: api.id,
    title: api.title,
    messages: api.messages.map(adaptMessage),
    createdAt: new Date(api.created_at),
    updatedAt: new Date(api.updated_at),
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export type ProviderKey =
  | 'askdocs-default'
  | 'openai'
  | 'anthropic'
  | 'google-gemini'

export interface ProviderConfig {
  provider: ProviderKey
  apiKey?: string
  baseUrl?: string
  model: string
  temperature: number
  maxTokens: number
  lastTestStatus?: 'ok' | 'error' | 'untested'
  apiKeyLast4?: string
}

const _BACKEND_TO_FRONTEND: Record<string, ProviderKey> = {
  gemini: 'google-gemini',
}
const _FRONTEND_TO_BACKEND: Partial<Record<ProviderKey, string>> = {
  'google-gemini': 'gemini',
}

export function backendToProviderKey(name: string): ProviderKey {
  return (_BACKEND_TO_FRONTEND[name] ?? name) as ProviderKey
}

export function providerKeyToBackend(key: ProviderKey): string {
  return _FRONTEND_TO_BACKEND[key] ?? key
}

export function adaptProviderConfig(api: ApiProviderConfig): ProviderConfig {
  return {
    provider: backendToProviderKey(api.provider_name),
    model: api.model_name,
    temperature: api.temperature,
    maxTokens: api.max_tokens,
    baseUrl: api.base_url ?? undefined,
    lastTestStatus: api.last_test_status,
    apiKeyLast4: api.api_key_last_4,
  }
}

// ── Members ───────────────────────────────────────────────────────────────────

export interface WorkspaceMember {
  id: string
  user: { name: string; email: string; avatarInitials: string }
  role: 'admin' | 'member' | 'viewer'
  joinedAt: Date
}

export function adaptMember(api: ApiMember): WorkspaceMember {
  const displayName = `${api.first_name} ${api.last_name}`.trim() || api.email
  const initials = (
    (api.first_name?.[0] ?? '') + (api.last_name?.[0] ?? '')
  ).toUpperCase() || api.email[0].toUpperCase()
  return {
    id: api.user_id,
    user: { name: displayName, email: api.email, avatarInitials: initials },
    role: api.role,
    joinedAt: new Date(api.joined_at),
  }
}

export interface PendingInvite {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  token: string
  invitedAt: Date
  expiresAt: Date
}

export function adaptInvitation(api: ApiPendingInvitation): PendingInvite {
  const invitedAt = new Date(api.invited_at)
  const expiresAt = new Date(invitedAt.getTime() + 24 * 60 * 60 * 1000)
  return {
    id: api.id,
    email: api.email,
    role: api.role,
    token: api.token,
    invitedAt,
    expiresAt,
  }
}

// ── Model info (for ChatInput indicator) ─────────────────────────────────────

export interface ModelInfo {
  provider: string
  model: string
  source: 'platform-default' | 'own-key'
}

// ── Usage ─────────────────────────────────────────────────────────────────────

export interface UsageStats {
  queriesThisMonth: number
  queriesLimit: number
  queriesRemaining: number
}
