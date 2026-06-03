/**
 * Centralized constants for the AskDocs frontend.
 *
 * All magic numbers, repeated string literals, and cross-cutting
 * configuration values are defined here. Import from this module
 * instead of hardcoding values in components or hooks.
 */

// ── Environment / API ────────────────────────────────────────────────────────
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

// ── App routes ───────────────────────────────────────────────────────────────
export const ROUTES = {
  SIGN_IN: '/sign-in',
  CHAT: '/chat',
  DOCUMENTS: '/documents',
  SETTINGS: '/settings',
} as const

// ── localStorage keys ────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'askdocs_access_token',
  REFRESH_TOKEN: 'askdocs_refresh_token',
  ACTIVE_WORKSPACE: 'askdocs_active_workspace',
  PENDING_INVITE: 'pending_invite',
} as const

// ── File upload ──────────────────────────────────────────────────────────────
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const
export const ALLOWED_ACCEPT = ALLOWED_EXTENSIONS.join(',')

// ── Chat / RAG ───────────────────────────────────────────────────────────────
export const DEFAULT_TOP_K = 5
export const DEFAULT_CONVERSATION_TITLE = 'New conversation'
export const JWT_REFRESH_BUFFER_MS = 30_000

// ── LLM provider defaults ────────────────────────────────────────────────────
export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_MAX_TOKENS = 2048
export const EMBEDDING_DIMENSIONS = 768

// ── Invitation ───────────────────────────────────────────────────────────────
export const INVITATION_EXPIRY_MS = 24 * 60 * 60 * 1000

// ── UI timeouts ──────────────────────────────────────────────────────────────
export const COPY_FEEDBACK_MS = 2000
export const SAVE_FEEDBACK_MS = 3000

// ── Usage / quota ────────────────────────────────────────────────────────────
export const USAGE_WARNING_THRESHOLD = 85 // percentage

// ── SSE event types ──────────────────────────────────────────────────────────
export const SSE_EVENTS = {
  TOKEN: 'token',
  COMPLETE: 'complete',
  ERROR: 'error',
  SOURCES: 'sources',
} as const

// ── Error codes (must match backend) ─────────────────────────────────────────
export const ERROR_CODES = {
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  INSUFFICIENT_ROLE: 'insufficient_role',
  INVITATION_EXPIRED: 'invitation_expired',
} as const

// ── React Query key factory ──────────────────────────────────────────────────
export const queryKeys = {
  me: () => ['me'] as const,
  conversations: (workspaceId?: string) =>
    ['conversations', workspaceId] as const,
  conversation: (workspaceId?: string, conversationId?: string) =>
    ['conversation', workspaceId, conversationId] as const,
  sources: (workspaceId?: string, conversationId?: string, messageId?: string) =>
    ['sources', workspaceId, conversationId, messageId] as const,
  documents: (workspaceId?: string) =>
    ['documents', workspaceId] as const,
  document: (workspaceId?: string, documentId?: string) =>
    ['document', workspaceId, documentId] as const,
  provider: (workspaceId?: string) =>
    ['provider', workspaceId] as const,
  supportedProviders: () => ['providers', 'supported'] as const,
  members: (workspaceId?: string) =>
    ['members', workspaceId] as const,
  invitations: (workspaceId?: string) =>
    ['invitations', workspaceId] as const,
  quota: (workspaceId?: string) =>
    ['quota', workspaceId] as const,
} as const
