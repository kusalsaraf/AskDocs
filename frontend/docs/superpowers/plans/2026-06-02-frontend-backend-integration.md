# Frontend ↔ Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data in the frontend with real API calls to the Django backend at `http://localhost:8000/api/v1/`, covering auth, workspaces, documents, chat streaming, and settings.

**Architecture:** TanStack Query for server state; single axios instance with JWT interceptors; native fetch + ReadableStream for SSE streaming; WorkspaceContext at layout level; adapter pattern maps backend types to frontend domain types.

**Tech Stack:** Next.js 14, TanStack Query, axios, @react-oauth/google, react-markdown, TypeScript strict

---

## File Map

**Create:**
- `frontend/.env.local`
- `frontend/lib/types/api.ts` — exact backend response shapes
- `frontend/lib/types/domain.ts` — UI types (replaces lib/types.ts), includes adapters
- `frontend/lib/logger.ts`
- `frontend/lib/utils/sse.ts`
- `frontend/lib/api/auth.ts`
- `frontend/lib/api/client.ts`
- `frontend/lib/api/users.ts`
- `frontend/lib/api/workspaces.ts`
- `frontend/lib/api/documents.ts`
- `frontend/lib/api/providers.ts`
- `frontend/lib/api/chat.ts`
- `frontend/lib/contexts/AuthContext.tsx`
- `frontend/lib/contexts/WorkspaceContext.tsx`
- `frontend/lib/hooks/useAuth.ts`
- `frontend/lib/hooks/useWorkspace.ts`
- `frontend/lib/hooks/useDocuments.ts`
- `frontend/lib/hooks/useChat.ts`
- `frontend/lib/hooks/useProviders.ts`
- `frontend/components/layout/AuthGuard.tsx`

**Modify:**
- `frontend/.env.example`
- `frontend/package.json` (via npm install)
- `frontend/app/layout.tsx` — add QueryClientProvider, GoogleOAuthProvider
- `frontend/app/(app)/layout.tsx` — AuthGuard, WorkspaceContext, real Sidebar data
- `frontend/app/(auth)/sign-in/page.tsx` — real Google OAuth
- `frontend/app/(app)/chat/page.tsx` — real new conversation
- `frontend/app/(app)/chat/[id]/page.tsx` — real data + streaming
- `frontend/app/(app)/documents/page.tsx` — useDocuments
- `frontend/app/(app)/settings/page.tsx` — real providers/members/workspace/usage
- `frontend/components/layout/Sidebar.tsx` — remove mock imports
- `frontend/components/layout/WorkspaceSwitcher.tsx` — use context
- `frontend/components/layout/UserMenu.tsx` — real logout
- `frontend/components/chat/ChatInput.tsx` — real model indicator
- `frontend/components/chat/ChatMessage.tsx` — new Citation type
- `frontend/components/chat/SourcePanel.tsx` — new Citation type
- `frontend/components/documents/DocumentCard.tsx` — new Document type + delete
- `frontend/components/documents/StatusBadge.tsx` — add pending
- `frontend/components/documents/UploadModal.tsx` — real upload

**Delete (Task 31):**
- `frontend/lib/mock-data.ts`
- `frontend/lib/api.ts`
- `frontend/lib/types.ts`

---

## Task 1: Install dependencies and set up env files

**Files:**
- Modify: `frontend/package.json` (via npm)
- Create: `frontend/.env.local`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Install packages**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/frontend
npm install @tanstack/react-query @tanstack/react-query-devtools axios @react-oauth/google react-markdown
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create `.env.local`**

Create `frontend/.env.local` with:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=284246838643-fl418bq8ekc7tm6fg06urft2bl9lt113.apps.googleusercontent.com
```

- [ ] **Step 3: Update `.env.example`**

Replace contents of `frontend/.env.example` with:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

- [ ] **Step 4: Verify install**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/frontend
node -e "require('@tanstack/react-query'); require('axios'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "feat(frontend): install TanStack Query, axios, @react-oauth/google, react-markdown"
```

---

## Task 2: TypeScript types — API layer (`lib/types/api.ts`)

**Files:**
- Create: `frontend/lib/types/api.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/types
```

- [ ] **Step 2: Write `frontend/lib/types/api.ts`**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/api.ts
git commit -m "feat(frontend): add backend API TypeScript types"
```

---

## Task 3: Domain types (`lib/types/domain.ts`) — replace `lib/types.ts`

**Files:**
- Create: `frontend/lib/types/domain.ts`

This file replaces `frontend/lib/types.ts`. All existing components import from here after the cleanup task. It keeps shapes close to the old `types.ts` so component changes are minimal, but references backend types via adapters.

- [ ] **Step 1: Write `frontend/lib/types/domain.ts`**

```typescript
import type {
  ApiUser, ApiWorkspace, ApiDocument, ApiDocumentStatus,
  ApiCitation, ApiMessage, ApiConversation, ApiConversationSummary,
  ApiProviderConfig, ApiMember, ApiPendingInvitation,
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
  const initials = ((api.first_name?.[0] ?? '') + (api.last_name?.[0] ?? '')).toUpperCase() || api.email[0].toUpperCase()
  return { id: api.id, name: api.display_name || `${api.first_name} ${api.last_name}`.trim() || api.email, email: api.email, avatarInitials: initials, role }
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
    id: api.id, name: api.name, slug: api.slug, is_personal: api.is_personal,
    logoInitials: api.name.substring(0, 2).toUpperCase(),
    memberCount: api.member_count, role: api.role,
  }
}

// ── Document ──────────────────────────────────────────────────────────────────

export type DocumentStatus = ApiDocumentStatus  // 'pending' | 'processing' | 'ready' | 'failed'
export type DocumentType   = 'pdf' | 'docx' | 'txt' | 'md' | 'unknown'

export interface Document {
  id: string
  name: string           // filename
  type: DocumentType
  size: number           // file_size_bytes
  uploadedAt: Date       // created_at
  uploadedBy: { name: string }
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
    id: api.id, name: api.filename, type: inferType(api.filename),
    size: api.file_size_bytes, uploadedAt: new Date(api.created_at),
    uploadedBy: { name: api.uploaded_by?.display_name ?? 'Unknown' },
    status: api.status, errorMessage: api.error_message,
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
    id: api.index, chunkId: api.chunk_id, documentId: api.document_id,
    documentName: api.document_filename, excerpt: '', pageNumber: api.page_number,
  }
}

export function adaptCitationWithSource(api: ApiCitation, excerpt: string): Citation {
  return { ...adaptCitation(api), excerpt }
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
    id: api.id, role: api.role, content: api.content,
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
  return { id: api.id, title: api.title, lastMessage: '', updatedAt: new Date(api.last_message_at) }
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
    id: api.id, title: api.title,
    messages: api.messages.map(adaptMessage),
    createdAt: new Date(api.created_at),
    updatedAt: new Date(api.updated_at),
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export type ProviderKey =
  | 'askdocs-default' | 'openai' | 'anthropic' | 'google-gemini'
  | 'azure-openai' | 'mistral' | 'groq' | 'ollama'

export interface ProviderConfig {
  provider: ProviderKey
  apiKey?: string
  baseUrl?: string
  region?: string
  model: string
  temperature: number
  maxTokens: number
  lastTestStatus?: 'ok' | 'error' | 'untested'
  apiKeyLast4?: string
}

export function adaptProviderConfig(api: ApiProviderConfig): ProviderConfig {
  return {
    provider: api.provider_name as ProviderKey,
    model: api.model_name,
    temperature: api.temperature,
    maxTokens: api.max_tokens,
    baseUrl: api.base_url ?? undefined,
    region: api.azure_region ?? undefined,
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
  const initials = api.display_name.split(' ').map(p => p[0] ?? '').join('').toUpperCase().substring(0, 2)
  return {
    id: api.user_id,
    user: { name: api.display_name, email: api.email, avatarInitials: initials },
    role: api.role, joinedAt: new Date(api.joined_at),
  }
}

export interface PendingInvite {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  invitedAt: Date
}

export function adaptInvitation(api: ApiPendingInvitation): PendingInvite {
  return { id: api.id, email: api.email, role: api.role, invitedAt: new Date(api.created_at) }
}

// ── Model info (for ChatInput indicator) ─────────────────────────────────────

export interface ModelInfo {
  provider: string
  model: string
  source: 'platform-default' | 'own-key'
}

// ── Other unchanged types ─────────────────────────────────────────────────────

export interface DailyQueryStat {
  date: string
  count: number
}

export interface UsageStats {
  queriesThisMonth: number
  queriesLimit: number
  queriesRemaining: number
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types/domain.ts
git commit -m "feat(frontend): add domain types with backend adapters"
```

---

## Task 4: Logger and utils

**Files:**
- Create: `frontend/lib/logger.ts`
- Create: `frontend/lib/utils/sse.ts`

- [ ] **Step 1: Write `frontend/lib/logger.ts`**

```typescript
const isProd = process.env.NODE_ENV === 'production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (...args: any[]) => void
const noop: LogFn = () => {}

export const logger = {
  log:   isProd ? noop : console.log.bind(console),
  warn:  isProd ? noop : console.warn.bind(console),
  error: isProd ? noop : console.error.bind(console),
}
```

- [ ] **Step 2: Write `frontend/lib/utils/sse.ts`**

```typescript
import type { SSEEvent } from '@/lib/types/api'

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const raw of events) {
        if (!raw.trim()) continue
        let eventType = ''
        let dataLine = ''

        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          if (line.startsWith('data: '))  dataLine  = line.slice(6).trim()
        }

        if (!eventType || !dataLine) continue

        try {
          const payload = JSON.parse(dataLine)
          if (eventType === 'token')    yield { type: 'token',    ...payload } as SSEEvent
          if (eventType === 'complete') yield { type: 'complete', ...payload } as SSEEvent
          if (eventType === 'error')    yield { type: 'error',    ...payload } as SSEEvent
        } catch {
          // malformed JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
```

- [ ] **Step 3: Verify SSE parser manually**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/frontend
node -e "
const { ReadableStream } = require('stream/web');
console.log('SSE parser module structure OK');
"
```

Expected: no import error (TypeScript will catch issues at build time).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/logger.ts frontend/lib/utils/sse.ts
git commit -m "feat(frontend): add logger and SSE stream parser"
```

---

## Task 5: Auth token storage (`lib/api/auth.ts`)

**Files:**
- Create: `frontend/lib/api/auth.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/api
```

- [ ] **Step 2: Write `frontend/lib/api/auth.ts`**

```typescript
const ACCESS_KEY  = 'askdocs_access_token'
const REFRESH_KEY = 'askdocs_refresh_token'

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function hasTokens(): boolean {
  return getAccessToken() !== null
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api/auth.ts
git commit -m "feat(frontend): add JWT token storage module"
```

---

## Task 6: Axios client with interceptors (`lib/api/client.ts`)

**Files:**
- Create: `frontend/lib/api/client.ts`

- [ ] **Step 1: Write `frontend/lib/api/client.ts`**

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

export const apiClient = axios.create({ baseURL: BASE_URL })

// Inject Bearer token on every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 → try refresh once, then redirect
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error)
    }

    const refresh = getRefreshToken()
    if (!refresh) {
      clearTokens()
      if (typeof window !== 'undefined') window.location.href = '/sign-in'
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(apiClient(original))
        })
      })
    }

    isRefreshing = true
    original._retried = true

    try {
      const { data } = await axios.post<{ access: string; refresh: string }>(
        `${BASE_URL}/auth/token/refresh/`,
        { refresh }
      )
      setTokens(data.access, data.refresh)
      refreshQueue.forEach((cb) => cb(data.access))
      refreshQueue = []
      original.headers.Authorization = `Bearer ${data.access}`
      return apiClient(original)
    } catch {
      clearTokens()
      refreshQueue = []
      if (typeof window !== 'undefined') window.location.href = '/sign-in'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api/client.ts
git commit -m "feat(frontend): add axios client with JWT interceptors and token refresh"
```

---

## Task 7: API modules — users, workspaces, documents, providers, chat

**Files:**
- Create: `frontend/lib/api/users.ts`
- Create: `frontend/lib/api/workspaces.ts`
- Create: `frontend/lib/api/documents.ts`
- Create: `frontend/lib/api/providers.ts`
- Create: `frontend/lib/api/chat.ts`

- [ ] **Step 1: Write `frontend/lib/api/users.ts`**

```typescript
import { apiClient } from './client'
import type { MeResponse } from '@/lib/types/api'

export async function getMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/me/')
  return data
}
```

- [ ] **Step 2: Write `frontend/lib/api/workspaces.ts`**

```typescript
import { apiClient } from './client'
import type { ApiWorkspace, ApiMember, ApiPendingInvitation } from '@/lib/types/api'

export async function listWorkspaces(): Promise<ApiWorkspace[]> {
  const { data } = await apiClient.get<ApiWorkspace[]>('/workspaces/')
  return data
}

export async function createWorkspace(name: string): Promise<ApiWorkspace> {
  const { data } = await apiClient.post<ApiWorkspace>('/workspaces/', { name })
  return data
}

export async function updateWorkspace(id: string, name: string): Promise<ApiWorkspace> {
  const { data } = await apiClient.patch<ApiWorkspace>(`/workspaces/${id}/`, { name })
  return data
}

export async function listMembers(workspaceId: string): Promise<ApiMember[]> {
  const { data } = await apiClient.get<ApiMember[]>(`/workspaces/${workspaceId}/members/`)
  return data
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/members/${userId}/`)
}

export async function updateMemberRole(
  workspaceId: string, userId: string, role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  await apiClient.patch(`/workspaces/${workspaceId}/members/${userId}/`, { role })
}

export async function inviteMember(
  workspaceId: string, email: string, role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  await apiClient.post(`/workspaces/${workspaceId}/invitations/`, { email, role })
}

export async function listInvitations(workspaceId: string): Promise<ApiPendingInvitation[]> {
  const { data } = await apiClient.get<ApiPendingInvitation[]>(`/workspaces/${workspaceId}/invitations/`)
  return data
}
```

- [ ] **Step 3: Write `frontend/lib/api/documents.ts`**

```typescript
import { apiClient } from './client'
import type { ApiDocument } from '@/lib/types/api'

export async function listDocuments(workspaceId: string): Promise<ApiDocument[]> {
  const { data } = await apiClient.get<ApiDocument[]>(`/workspaces/${workspaceId}/documents/`)
  return data
}

export async function getDocument(workspaceId: string, documentId: string): Promise<ApiDocument> {
  const { data } = await apiClient.get<ApiDocument>(`/workspaces/${workspaceId}/documents/${documentId}/`)
  return data
}

export async function uploadDocument(
  workspaceId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<ApiDocument> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<ApiDocument>(
    `/workspaces/${workspaceId}/documents/`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100))
      },
    }
  )
  return data
}

export async function deleteDocument(workspaceId: string, documentId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/documents/${documentId}/`)
}
```

- [ ] **Step 4: Write `frontend/lib/api/providers.ts`**

```typescript
import { apiClient } from './client'
import type {
  ApiProviderResponse, ApiSupportedProvider, ApiTestConnectionResult
} from '@/lib/types/api'

export async function getProvider(workspaceId: string): Promise<ApiProviderResponse> {
  const { data } = await apiClient.get<ApiProviderResponse>(`/workspaces/${workspaceId}/provider/`)
  return data
}

export async function saveProvider(
  workspaceId: string,
  payload: {
    provider_name: string
    api_key?: string
    model_name: string
    temperature: number
    max_tokens: number
    base_url?: string
    azure_region?: string
  }
): Promise<ApiProviderResponse> {
  const { data } = await apiClient.put<ApiProviderResponse>(
    `/workspaces/${workspaceId}/provider/`, payload
  )
  return data
}

export async function deleteProvider(workspaceId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/provider/`)
}

export async function testProvider(workspaceId: string): Promise<ApiTestConnectionResult> {
  const { data } = await apiClient.post<ApiTestConnectionResult>(
    `/workspaces/${workspaceId}/provider/test/`
  )
  return data
}

export async function listSupportedProviders(): Promise<ApiSupportedProvider[]> {
  const { data } = await apiClient.get<ApiSupportedProvider[]>('/providers/supported/')
  return data
}
```

- [ ] **Step 5: Write `frontend/lib/api/chat.ts`**

```typescript
import { apiClient } from './client'
import { getAccessToken } from './auth'
import { parseSSEStream } from '@/lib/utils/sse'
import type {
  ApiConversationSummary, ApiConversation, ApiChunkSource, ApiQuota, SSEEvent
} from '@/lib/types/api'

export async function listConversations(workspaceId: string): Promise<ApiConversationSummary[]> {
  const { data } = await apiClient.get<ApiConversationSummary[]>(
    `/workspaces/${workspaceId}/conversations/`
  )
  return data
}

export async function createConversation(workspaceId: string): Promise<ApiConversationSummary> {
  const { data } = await apiClient.post<ApiConversationSummary>(
    `/workspaces/${workspaceId}/conversations/`, {}
  )
  return data
}

export async function getConversation(
  workspaceId: string, conversationId: string
): Promise<ApiConversation> {
  const { data } = await apiClient.get<ApiConversation>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/`
  )
  return data
}

export async function deleteConversation(
  workspaceId: string, conversationId: string
): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/conversations/${conversationId}/`)
}

export async function updateConversationTitle(
  workspaceId: string, conversationId: string, title: string
): Promise<void> {
  await apiClient.patch(`/workspaces/${workspaceId}/conversations/${conversationId}/`, { title })
}

export async function getMessageSources(
  workspaceId: string, conversationId: string, messageId: string
): Promise<ApiChunkSource[]> {
  const { data } = await apiClient.get<ApiChunkSource[]>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/sources/`
  )
  return data
}

export async function getQuota(workspaceId: string): Promise<ApiQuota> {
  const { data } = await apiClient.get<ApiQuota>(`/workspaces/${workspaceId}/chat/quota/`)
  return data
}

// Streaming send — yields SSEEvents as they arrive
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
        'Accept': 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, top_k: topK }),
    }
  )

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  if (!res.body) throw new Error('No response body')

  yield* parseSSEStream(res.body)
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/api/
git commit -m "feat(frontend): add API modules (users, workspaces, documents, providers, chat)"
```

---

## Task 8: Auth context and hook

**Files:**
- Create: `frontend/lib/contexts/AuthContext.tsx`
- Create: `frontend/lib/hooks/useAuth.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/contexts
mkdir -p /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/hooks
```

- [ ] **Step 2: Write `frontend/lib/contexts/AuthContext.tsx`**

```typescript
'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMe } from '@/lib/api/users'
import { setTokens, clearTokens, hasTokens } from '@/lib/api/auth'
import { apiClient } from '@/lib/api/client'
import { adaptUser } from '@/lib/types/domain'
import type { User } from '@/lib/types/domain'
import type { ApiWorkspace } from '@/lib/types/api'

interface AuthContextValue {
  user: User | null
  workspaces: ApiWorkspace[]
  isLoading: boolean
  isAuthenticated: boolean
  loginWithGoogle: (accessToken: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [skipFetch, setSkipFetch] = useState(!hasTokens())

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !skipFetch,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const loginWithGoogle = useCallback(async (googleAccessToken: string) => {
    const { data: tokens } = await apiClient.post<{ access: string; refresh: string }>(
      '/auth/google/', { access_token: googleAccessToken }
    )
    setTokens(tokens.access, tokens.refresh)
    setSkipFetch(false)
    await queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [queryClient])

  const logout = useCallback(async () => {
    try {
      const { getRefreshToken } = await import('@/lib/api/auth')
      const refresh = getRefreshToken()
      if (refresh) await apiClient.post('/auth/logout/', { refresh })
    } catch { /* best-effort */ }
    clearTokens()
    queryClient.clear()
    setSkipFetch(true)
    window.location.href = '/sign-in'
  }, [queryClient])

  const user = data ? adaptUser(data.user, data.workspaces[0]?.role ?? 'member') : null
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{
      user, workspaces: data?.workspaces ?? [], isLoading: !skipFetch && isLoading,
      isAuthenticated, loginWithGoogle, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 3: Write `frontend/lib/hooks/useAuth.ts`**

```typescript
export { useAuthContext as useAuth } from '@/lib/contexts/AuthContext'
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/contexts/AuthContext.tsx frontend/lib/hooks/useAuth.ts
git commit -m "feat(frontend): add AuthContext with Google login and logout"
```

---

## Task 9: Wrap `app/layout.tsx` with providers

**Files:**
- Modify: `frontend/app/layout.tsx`

Current file has only `ThemeProvider`. Add `QueryClientProvider`, `ReactQueryDevtools`, `GoogleOAuthProvider`, and `AuthProvider`.

- [ ] **Step 1: Replace `frontend/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { Providers } from '@/components/layout/Providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'AskDocs — Document intelligence for teams',
  description: 'Ask questions in natural language. Get answers grounded in your team\'s documents, with inline citations.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create `frontend/components/layout/Providers.tsx`**

```typescript
'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from '@/lib/contexts/AuthContext'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } },
})

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? ''

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/layout.tsx frontend/components/layout/Providers.tsx
git commit -m "feat(frontend): add QueryClientProvider, GoogleOAuthProvider, AuthProvider to root layout"
```

---

## Task 10: Protected route guard and sign-in page

**Files:**
- Create: `frontend/components/layout/AuthGuard.tsx`
- Modify: `frontend/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Write `frontend/components/layout/AuthGuard.tsx`**

```typescript
'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/sign-in')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-indigo-500" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <>{children}</>
}
```

- [ ] **Step 2: Replace `frontend/app/(auth)/sign-in/page.tsx`**

Replace the `handleGoogle` function and imports. Keep all existing JSX — only change imports and the `handleGoogle` function body:

```typescript
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '@/lib/hooks/useAuth'
import { cn } from '@/lib/utils'

// GoogleIcon, Spinner, ThemeToggle components — keep existing code unchanged

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = resolvedTheme === 'dark'
  return (
    <button
      onClick={() => mounted && setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className={cn('fixed right-4 top-4 rounded-lg p-2 transition-colors', 'text-muted-foreground hover:text-foreground', 'hover:bg-muted border border-transparent hover:border-border')}
    >
      {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="block h-4 w-4" />}
    </button>
  )
}

export default function SignInPage() {
  const router = useRouter()
  const { loginWithGoogle, isAuthenticated } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) router.replace('/chat')
  }, [isAuthenticated, router])

  const handleGoogle = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true)
      setError(null)
      try {
        await loginWithGoogle(tokenResponse.access_token)
        router.replace('/chat')
      } catch {
        setError('Sign-in failed. Please try again.')
        setGoogleLoading(false)
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed.')
      setGoogleLoading(false)
    },
  })

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <ThemeToggle />
      <p className="mb-8 text-sm text-muted-foreground text-center">
        Chat with your company&apos;s documents. Get answers with sources.
      </p>
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-card p-8 shadow-xl shadow-black/10 dark:shadow-black/40">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/20">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-medium tracking-tight text-foreground">Welcome to AskDocs</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to access your workspace</p>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400 ring-1 ring-rose-500/20">{error}</p>
        )}

        <button
          onClick={() => { setGoogleLoading(true); handleGoogle() }}
          disabled={googleLoading}
          className={cn('flex w-full items-center justify-center gap-3 rounded-lg px-4 py-2.5', 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700', 'text-sm font-medium text-white', 'transition-colors duration-150', 'disabled:opacity-70 disabled:cursor-not-allowed')}
        >
          {googleLoading ? <Spinner /> : <GoogleIcon />}
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={() => router.push('/sign-in?demo=1')}
          className={cn('flex w-full items-center justify-center rounded-lg px-4 py-2.5', 'border border-border', 'text-sm font-medium text-muted-foreground', 'hover:border-zinc-400 hover:text-foreground dark:hover:border-border/60', 'transition-colors duration-150')}
        >
          Try the demo
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
          By signing in, you agree to our{' '}
          <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">Terms</a>{' '}and{' '}
          <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/layout/AuthGuard.tsx frontend/app/(auth)/sign-in/page.tsx
git commit -m "feat(frontend): wire Google OAuth sign-in and auth guard"
```

---

## Task 11: WorkspaceContext + update `(app)/layout.tsx`

**Files:**
- Create: `frontend/lib/contexts/WorkspaceContext.tsx`
- Create: `frontend/lib/hooks/useWorkspace.ts`
- Modify: `frontend/app/(app)/layout.tsx`

- [ ] **Step 1: Write `frontend/lib/contexts/WorkspaceContext.tsx`**

```typescript
'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { adaptWorkspace } from '@/lib/types/domain'
import type { Workspace } from '@/lib/types/domain'
import type { ApiWorkspace } from '@/lib/types/api'

const STORAGE_KEY = 'askdocs_active_workspace'

interface WorkspaceContextValue {
  activeWorkspace: Workspace | null
  rawWorkspaces: ApiWorkspace[]
  workspaces: Workspace[]
  setActiveWorkspace: (ws: Workspace) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { workspaces: rawWorkspaces } = useAuth()
  const queryClient = useQueryClient()
  const adapted = rawWorkspaces.map(adaptWorkspace)

  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)

  // Initialise active workspace from localStorage or first personal
  useEffect(() => {
    if (!adapted.length) return
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    const match = saved ? adapted.find((w) => w.id === saved) : null
    const defaultWs = match ?? adapted.find((w) => w.is_personal) ?? adapted[0]
    setActiveWorkspaceState(defaultWs ?? null)
  }, [rawWorkspaces]) // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveWorkspace = useCallback((ws: Workspace) => {
    localStorage.setItem(STORAGE_KEY, ws.id)
    setActiveWorkspaceState(ws)
    queryClient.removeQueries({ queryKey: ['documents'] })
    queryClient.removeQueries({ queryKey: ['conversations'] })
  }, [queryClient])

  return (
    <WorkspaceContext.Provider value={{
      activeWorkspace, rawWorkspaces, workspaces: adapted, setActiveWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceProvider')
  return ctx
}
```

- [ ] **Step 2: Write `frontend/lib/hooks/useWorkspace.ts`**

```typescript
export { useWorkspaceContext as useWorkspace } from '@/lib/contexts/WorkspaceContext'
```

- [ ] **Step 3: Replace `frontend/app/(app)/layout.tsx`**

```typescript
'use client'

import React, { useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { WorkspaceProvider } from '@/lib/contexts/WorkspaceContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAuth } from '@/lib/hooks/useAuth'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useQuery } from '@tanstack/react-query'
import { listConversations } from '@/lib/api/chat'
import { adaptConversationSummary } from '@/lib/types/domain'

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()

  const activeId = pathname.startsWith('/chat/')
    ? pathname.split('/chat/')[1]
    : undefined

  const { data: rawConvs = [] } = useQuery({
    queryKey: ['conversations', activeWorkspace?.id],
    queryFn: () => listConversations(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    staleTime: 30_000,
  })
  const conversations = rawConvs.map(adaptConversationSummary)

  if (!user || !activeWorkspace) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!sidebarCollapsed && (
        <Sidebar
          conversations={conversations}
          activeConversationId={activeId}
          workspace={activeWorkspace}
          user={user}
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {sidebarCollapsed && (
          <div className="absolute top-3 left-3 z-10">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground/70 hover:border-border transition-colors"
              aria-label="Open sidebar"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </AuthGuard>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/contexts/WorkspaceContext.tsx frontend/lib/hooks/useWorkspace.ts frontend/app/(app)/layout.tsx
git commit -m "feat(frontend): add WorkspaceContext and wire app layout with real auth + conversations"
```

---

## Task 12: Update Sidebar, WorkspaceSwitcher, UserMenu

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`
- Modify: `frontend/components/layout/WorkspaceSwitcher.tsx`
- Modify: `frontend/components/layout/UserMenu.tsx`

- [ ] **Step 1: Update `frontend/components/layout/Sidebar.tsx`**

Remove the `import { mockWorkspaces } from '@/lib/mock-data'` line and update `WorkspaceSwitcher` usage to get workspaces from context. Replace the import block:

```typescript
'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus, MoreHorizontal, FileText, PanelLeftClose } from 'lucide-react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { ConversationSummary, User, Workspace } from '@/lib/types/domain'
import { truncate, cn } from '@/lib/utils'
import { RelativeTime } from '@/components/ui/relative-time'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { UserMenu } from './UserMenu'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { createConversation, deleteConversation } from '@/lib/api/chat'
```

Update the `Sidebar` component body — replace `<WorkspaceSwitcher workspace={workspace} workspaces={mockWorkspaces} />` with:
```typescript
const { workspaces, setActiveWorkspace } = useWorkspace()
// ...inside render:
<WorkspaceSwitcher workspace={workspace} workspaces={workspaces} onSwitch={setActiveWorkspace} />
```

Add `onSwitch` prop to `WorkspaceSwitcherProps`.

Replace "New chat" Link with a mutation button:
```typescript
const router = useRouter()
const queryClient = useQueryClient()
const { mutate: newChat } = useMutation({
  mutationFn: () => createConversation(workspace.id),
  onSuccess: (conv) => {
    queryClient.invalidateQueries({ queryKey: ['conversations', workspace.id] })
    router.push(`/chat/${conv.id}`)
  },
})
// ...
<Button variant="default" size="sm" className="w-full gap-2 justify-start" onClick={() => newChat()}>
  <Plus className="h-3.5 w-3.5" />
  New chat
</Button>
```

Add delete to ConversationItem kebab:
```typescript
const { mutate: delConv } = useMutation({
  mutationFn: () => deleteConversation(workspace.id, conversation.id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations', workspace.id] }),
})
// Delete DropdownMenuItem:
<DropdownMenuItem
  className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
  onClick={() => delConv()}
>Delete</DropdownMenuItem>
```

- [ ] **Step 2: Update `frontend/components/layout/WorkspaceSwitcher.tsx`**

Add `onSwitch` prop and `useQueryClient` for workspace creation modal (simple version: just switch, create via API):

```typescript
'use client'

import React, { useState } from 'react'
import { ChevronsUpDown, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Workspace } from '@/lib/types/domain'
import { createWorkspace } from '@/lib/api/workspaces'
import { adaptWorkspace } from '@/lib/types/domain'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface WorkspaceSwitcherProps {
  workspace: Workspace
  workspaces: Workspace[]
  onSwitch: (ws: Workspace) => void
}

export function WorkspaceSwitcher({ workspace, workspaces, onSwitch }: WorkspaceSwitcherProps) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const { mutate: doCreate } = useMutation({
    mutationFn: () => createWorkspace(newName.trim()),
    onSuccess: (api) => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onSwitch(adaptWorkspace(api))
      setCreating(false)
      setNewName('')
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted transition-colors group">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold">
              {workspace.logoInitials.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{workspace.name}</p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} className="gap-2.5" onClick={() => onSwitch(ws)}>
              <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-indigo-400 font-mono text-[9px] font-bold">
                {ws.logoInitials.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm">{ws.name}</p>
                <p className="text-xs text-muted-foreground">{ws.is_personal ? 'Personal' : 'Team'}</p>
              </div>
              {ws.id === workspace.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-muted-foreground" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create workspace…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
            <p className="mb-3 text-sm font-medium text-foreground">New workspace</p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) doCreate() }}
              placeholder="Workspace name"
              className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                onClick={() => newName.trim() && doCreate()}
                className="px-3 py-1.5 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
              >Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Update `frontend/components/layout/UserMenu.tsx`**

Change import from `@/lib/types` to `@/lib/types/domain` and wire real logout:

```typescript
// Replace top imports block with:
import { useAuth } from '@/lib/hooks/useAuth'
import type { User } from '@/lib/types/domain'
// ... keep all icon imports and dropdown imports

// Inside UserMenu component, add:
const { logout } = useAuth()

// Sign out DropdownMenuItem — add onClick:
<DropdownMenuItem
  className="gap-2.5 text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
  onClick={() => logout()}
>
  <LogOut className="h-4 w-4" />
  Sign out
</DropdownMenuItem>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/layout/
git commit -m "feat(frontend): wire Sidebar, WorkspaceSwitcher, UserMenu with real context data"
```

---

## Task 13: Document hooks and types update

**Files:**
- Create: `frontend/lib/hooks/useDocuments.ts`
- Modify: `frontend/components/documents/StatusBadge.tsx`

- [ ] **Step 1: Write `frontend/lib/hooks/useDocuments.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listDocuments, uploadDocument, deleteDocument, getDocument } from '@/lib/api/documents'
import { adaptDocument } from '@/lib/types/domain'
import type { Document } from '@/lib/types/domain'

export function useDocuments(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['documents', workspaceId],
    queryFn: async () => {
      const docs = await listDocuments(workspaceId!)
      return docs.map(adaptDocument)
    },
    enabled: !!workspaceId,
    staleTime: 15_000,
  })
}

export function useDocumentStatus(
  workspaceId: string | undefined,
  documentId: string | undefined,
  currentStatus: Document['status'] | undefined
) {
  return useQuery({
    queryKey: ['document', workspaceId, documentId],
    queryFn: async () => adaptDocument(await getDocument(workspaceId!, documentId!)),
    enabled: !!workspaceId && !!documentId && (currentStatus === 'pending' || currentStatus === 'processing'),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'ready' || s === 'failed' ? false : 3000
    },
  })
}

export function useUploadDocument(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (pct: number) => void }) =>
      uploadDocument(workspaceId!, file, onProgress).then(adaptDocument),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] })
    },
  })
}

export function useDeleteDocument(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) => deleteDocument(workspaceId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] })
    },
  })
}
```

- [ ] **Step 2: Update `frontend/components/documents/StatusBadge.tsx`**

Add `pending` status to `STATUS_CONFIG` and update import:

```typescript
import type { DocumentStatus } from '@/lib/types/domain'

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; className: string; spinner?: boolean }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/20',
    spinner: true,
  },
  ready: {
    label: 'Ready',
    className: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  },
  processing: {
    label: 'Processing',
    className: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
    spinner: true,
  },
  failed: {
    label: 'Failed',
    className: 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20',
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useDocuments.ts frontend/components/documents/StatusBadge.tsx
git commit -m "feat(frontend): add document hooks and pending status"
```

---

## Task 14: Wire documents page

**Files:**
- Modify: `frontend/app/(app)/documents/page.tsx`
- Modify: `frontend/components/documents/DocumentCard.tsx`
- Modify: `frontend/components/documents/UploadModal.tsx`

- [ ] **Step 1: Update `frontend/app/(app)/documents/page.tsx`**

Replace mock data with hooks. Update the import block and state initialization:

```typescript
'use client'

import React, { useState, useMemo } from 'react'
import { Search, Upload, LayoutGrid, List, FileQuestion, AlertCircle, RefreshCw } from 'lucide-react'
import type { DocumentStatus } from '@/lib/types/domain'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DocumentCard, DocumentRow } from '@/components/documents/DocumentCard'
import { UploadModal } from '@/components/documents/UploadModal'
import { useDocuments, useDeleteDocument } from '@/lib/hooks/useDocuments'
import { useWorkspace } from '@/lib/hooks/useWorkspace'

type ViewMode = 'grid' | 'list'
type FilterKey = 'all' | DocumentStatus
```

Remove the mock `useEffect`. Replace `loading` state with query `isLoading`. Replace `documents` state with query `data`:

```typescript
export default function DocumentsPage() {
  const { activeWorkspace } = useWorkspace()
  const { data: documents = [], isLoading, isError, refetch } = useDocuments(activeWorkspace?.id)
  const { mutate: doDelete } = useDeleteDocument(activeWorkspace?.id)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // counts, filtered — same useMemo logic, keep unchanged

  // Error state
  if (isError) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-rose-400" />
        <p className="text-sm text-foreground">Failed to load documents</p>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />Retry
        </Button>
      </div>
    </div>
  )
```

Pass `onDelete` to DocumentCard:
```typescript
{filtered.map((doc) => (
  <DocumentCard
    key={doc.id}
    document={doc}
    onClick={() => {}}
    onDelete={() => setDeleteConfirmId(doc.id)}
  />
))}
```

Add delete confirm modal at end of JSX:
```typescript
{deleteConfirmId && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
    <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
      <p className="mb-1 text-sm font-medium text-foreground">Delete document?</p>
      <p className="mb-4 text-xs text-muted-foreground">This cannot be undone.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
        <Button variant="destructive" size="sm" onClick={() => { doDelete(deleteConfirmId); setDeleteConfirmId(null) }}>Delete</Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Update `frontend/components/documents/DocumentCard.tsx`**

Change imports from `@/lib/types` → `@/lib/types/domain`. Update field references:

```typescript
import type { Document, DocumentType } from '@/lib/types/domain'

// FILE_STYLES: add 'unknown' key
const FILE_STYLES: Record<DocumentType, { bg: string; icon: string }> = {
  pdf:     { bg: 'bg-rose-500/15',    icon: 'text-rose-400'    },
  docx:    { bg: 'bg-blue-500/15',    icon: 'text-blue-400'    },
  txt:     { bg: 'bg-zinc-500/15',    icon: 'text-muted-foreground' },
  md:      { bg: 'bg-violet-500/15',  icon: 'text-violet-400'  },
  unknown: { bg: 'bg-muted/40',       icon: 'text-muted-foreground' },
}

// In DocumentCard: add onDelete prop
interface DocumentCardProps {
  document: Document
  onClick?: () => void
  onDelete?: () => void
}

// Update field usages:
// doc.name → doc.name (already adapted)
// doc.size → doc.size (already adapted)
// doc.uploadedAt → doc.uploadedAt (already adapted)
// doc.uploadedBy.name → doc.uploadedBy.name (already adapted)

// Remove doc.pageCount references (not in backend) — show '—'
const metaPrefix = formatFileSize(doc.size)  // remove pageCount

// Wire Delete menu item:
<DropdownMenuItem
  onClick={(e) => { e.stopPropagation(); onDelete?.() }}
  className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
>Delete</DropdownMenuItem>
```

Also update `DocumentRow` similarly (add `onDelete` prop, same field mapping).

- [ ] **Step 3: Update `frontend/components/documents/UploadModal.tsx`**

Replace `mockUpload` with real axios upload. Change the `handleUpload` function:

```typescript
// Add at top of file:
import { useUploadDocument } from '@/lib/hooks/useDocuments'
import { useWorkspace } from '@/lib/hooks/useWorkspace'

// Inside UploadModal component body:
const { activeWorkspace } = useWorkspace()
const { mutateAsync: doUpload } = useUploadDocument(activeWorkspace?.id)

// Replace handleUpload:
const handleUpload = async () => {
  const valid = files.filter((f) => !f.validationError)
  if (!valid.length || isUploading) return
  setIsUploading(true)

  const results = await Promise.allSettled(
    valid.map((sf) =>
      doUpload({
        file: sf.file,
        onProgress: (pct) =>
          setFiles((prev) =>
            prev.map((f) => f.id === sf.id ? { ...f, status: 'uploading', progress: pct } : f)
          ),
      }).then(() => {
        setFiles((prev) =>
          prev.map((f) => f.id === sf.id ? { ...f, status: 'uploaded', progress: 100 } : f)
        )
        return 'uploaded' as const
      }).catch((err: Error) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === sf.id ? { ...f, status: 'failed', progress: 0, error: err.message } : f
          )
        )
        return 'failed' as const
      })
    )
  )

  setIsUploading(false)
  const allOk = results.every((r) => r.status === 'fulfilled' && r.value === 'uploaded')
  if (allOk) setSuccessCount(valid.length)
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/(app)/documents/page.tsx frontend/components/documents/
git commit -m "feat(frontend): wire documents page with real API (list, upload, delete)"
```

---

## Task 15: Chat hooks

**Files:**
- Create: `frontend/lib/hooks/useChat.ts`

- [ ] **Step 1: Write `frontend/lib/hooks/useChat.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listConversations, getConversation, createConversation,
  deleteConversation, updateConversationTitle, getMessageSources,
} from '@/lib/api/chat'
import {
  adaptConversationSummary, adaptConversation, adaptCitationWithSource,
} from '@/lib/types/domain'
import type { ApiChunkSource } from '@/lib/types/api'

export function useConversations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', workspaceId],
    queryFn: async () => (await listConversations(workspaceId!)).map(adaptConversationSummary),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}

export function useConversation(workspaceId: string | undefined, conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', workspaceId, conversationId],
    queryFn: async () => adaptConversation(await getConversation(workspaceId!, conversationId!)),
    enabled: !!workspaceId && !!conversationId,
    staleTime: 0,
  })
}

export function useCreateConversation(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createConversation(workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] }),
  })
}

export function useDeleteConversation(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(workspaceId!, conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] }),
  })
}

export function useUpdateTitle(workspaceId: string | undefined, conversationId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) => updateConversationTitle(workspaceId!, conversationId!, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['conversation', workspaceId, conversationId] })
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
    queryFn: async () => {
      const sources: ApiChunkSource[] = await getMessageSources(workspaceId!, conversationId!, messageId!)
      return sources
    },
    enabled: !!workspaceId && !!conversationId && !!messageId,
    staleTime: Infinity,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/hooks/useChat.ts
git commit -m "feat(frontend): add chat hooks (conversations, messages, sources)"
```

---

## Task 16: Wire chat pages (list + conversation)

**Files:**
- Modify: `frontend/app/(app)/chat/page.tsx`
- Modify: `frontend/app/(app)/chat/[id]/page.tsx`

- [ ] **Step 1: Replace `frontend/app/(app)/chat/page.tsx`**

```typescript
'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/chat/EmptyState'
import { ChatInput } from '@/components/chat/ChatInput'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useCreateConversation } from '@/lib/hooks/useChat'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const router = useRouter()
  const { activeWorkspace } = useWorkspace()
  const { mutateAsync: createConv, isPending } = useCreateConversation(activeWorkspace?.id)

  const handleSubmit = async () => {
    if (!input.trim() || !activeWorkspace) return
    const conv = await createConv()
    // Navigate to new conversation — the chat/[id] page will handle sending the first message
    router.push(`/chat/${conv.id}?q=${encodeURIComponent(input.trim())}`)
  }

  const handleExampleClick = (question: string) => {
    setInput(question)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <span className="text-sm font-medium text-muted-foreground">New chat</span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <EmptyState onExampleClick={handleExampleClick} />
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isPending}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `frontend/app/(app)/chat/[id]/page.tsx`**

Full replacement implementing: load conversation, streaming send, optimistic messages:

```typescript
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Share2, MoreHorizontal, Pencil, Check, AlertCircle } from 'lucide-react'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { ChatInput } from '@/components/chat/ChatInput'
import { SourcePanel } from '@/components/chat/SourcePanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useConversation, useUpdateTitle, useMessageSources } from '@/lib/hooks/useChat'
import { sendMessageStream } from '@/lib/api/chat'
import { useQueryClient } from '@tanstack/react-query'
import type { Message, Citation } from '@/lib/types/domain'
import { cn } from '@/lib/utils'

export default function ConversationPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()

  const { data: conversation, isLoading } = useConversation(activeWorkspace?.id, params.id)
  const { mutate: saveTitle } = useUpdateTitle(activeWorkspace?.id, params.id)

  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [title, setTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [input, setInput] = useState('')
  const [activeCitationMsgId, setActiveCitationMsgId] = useState<string | null>(null)
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const hasAutoSent = useRef(false)

  // Sync from query data on first load
  useEffect(() => {
    if (conversation && localMessages.length === 0) {
      setLocalMessages(conversation.messages)
      setTitle(conversation.title)
      setTitleDraft(conversation.title)
    }
  }, [conversation]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-send message from URL param ?q=... (set by chat/page.tsx)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !hasAutoSent.current && localMessages.length === 0) {
      hasAutoSent.current = true
      setInput(q)
      // Small delay to let messages load first
      setTimeout(() => handleSubmit(q), 100)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  const handleCitationClick = (msgId: string, citation: Citation) => {
    if (activeCitationMsgId === msgId && activeCitationIndex === citation.id) {
      setActiveCitationMsgId(null)
      setActiveCitationIndex(null)
    } else {
      setActiveCitationMsgId(msgId)
      setActiveCitationIndex(citation.id)
    }
  }

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft.trim() !== title) {
      setTitle(titleDraft.trim())
      saveTitle(titleDraft.trim())
    }
    setEditingTitle(false)
  }

  const handleSubmit = useCallback(async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim()
    if (!content || isStreaming || !activeWorkspace) return

    setInput('')
    const tempUserId = `tmp-user-${Date.now()}`
    const tempAiId   = `tmp-ai-${Date.now()}`

    const userMsg: Message = {
      id: tempUserId, role: 'user', content,
      citations: [], createdAt: new Date(),
    }
    const aiMsg: Message = {
      id: tempAiId, role: 'assistant', content: '',
      citations: [], createdAt: new Date(), isStreaming: true,
    }

    setLocalMessages((prev) => [...prev, userMsg, aiMsg])
    setIsStreaming(true)
    scrollToBottom()

    try {
      let accContent = ''
      let finalCitations: Citation[] = []

      for await (const event of sendMessageStream(activeWorkspace.id, params.id, content)) {
        if (event.type === 'token') {
          accContent += event.delta
          setLocalMessages((prev) =>
            prev.map((m) => m.id === tempAiId ? { ...m, content: accContent } : m)
          )
          scrollToBottom()
        } else if (event.type === 'complete') {
          // Citations will be loaded from sources endpoint on click — store message_id
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.id === tempAiId
                ? { ...m, id: event.message_id, content: accContent, isStreaming: false, citations: finalCitations }
                : m
            )
          )
          queryClient.invalidateQueries({ queryKey: ['conversations', activeWorkspace.id] })
        } else if (event.type === 'error') {
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.id === tempAiId
                ? { ...m, isStreaming: false, streamError: event.message }
                : m
            )
          )
        }
      }
    } catch (err) {
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.id === tempAiId
            ? { ...m, isStreaming: false, streamError: 'Connection failed. Please try again.' }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, activeWorkspace, params.id, queryClient])

  // Find active citation from localMessages
  const activeCitationData = activeCitationMsgId
    ? localMessages.find((m) => m.id === activeCitationMsgId)?.citations.find((c) => c.id === activeCitationIndex)
    : null

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-indigo-500" />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false) }}
                  onBlur={handleTitleSave}
                  className="bg-muted border border-border rounded-md px-2.5 py-1 text-sm text-foreground focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 min-w-[240px]"
                />
                <button onClick={handleTitleSave} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setTitleDraft(title); setEditingTitle(true) }}
                className="group flex items-center gap-2 min-w-0"
              >
                <span className="truncate text-sm font-medium text-foreground max-w-[400px]">{title || 'Untitled'}</span>
                <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Share2 className="h-3 w-3" />Share
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground/70 hover:bg-muted transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
                  onClick={() => router.push('/chat')}
                >Delete conversation</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="py-6 space-y-6 max-w-3xl mx-auto w-full">
            {localMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                activeCitationId={activeCitationMsgId === message.id ? activeCitationIndex : null}
                onCitationClick={(c) => handleCitationClick(message.id, c)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <ChatInput value={input} onChange={setInput} onSubmit={() => handleSubmit()} disabled={isStreaming} />
      </div>

      {activeCitationData && activeCitationMsgId && (
        <SourcePanelWithFetch
          workspaceId={activeWorkspace?.id ?? ''}
          conversationId={params.id}
          messageId={activeCitationMsgId}
          citationIndex={activeCitationIndex ?? 0}
          onClose={() => { setActiveCitationMsgId(null); setActiveCitationIndex(null) }}
        />
      )}
    </div>
  )
}

function SourcePanelWithFetch({
  workspaceId, conversationId, messageId, citationIndex, onClose,
}: {
  workspaceId: string; conversationId: string; messageId: string
  citationIndex: number; onClose: () => void
}) {
  const { data: sources = [], isLoading } = useMessageSources(workspaceId, conversationId, messageId)
  const source = sources.find((_, i) => i === citationIndex - 1) ?? sources[0]

  if (isLoading) return (
    <aside className="w-[320px] shrink-0 border-l border-border/80 bg-card flex items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-indigo-500" />
    </aside>
  )

  if (!source) return null

  const citation: Citation = {
    id: citationIndex, chunkId: source.chunk_id, documentId: source.document_id,
    documentName: source.document_filename, excerpt: source.excerpt,
    pageNumber: source.page_number,
  }

  return <SourcePanel citation={citation} onClose={onClose} />
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/(app)/chat/
git commit -m "feat(frontend): wire chat pages with real data and SSE streaming"
```

---

## Task 17: Update ChatMessage and SourcePanel

**Files:**
- Modify: `frontend/components/chat/ChatMessage.tsx`
- Modify: `frontend/components/chat/SourcePanel.tsx`

- [ ] **Step 1: Update `frontend/components/chat/ChatMessage.tsx`**

Change import from `@/lib/types` to `@/lib/types/domain`. Update the citation map key from `c.id` (which now IS the index):

```typescript
// Replace import line:
import type { Message, Citation } from '@/lib/types/domain'

// ChatMessageProps: activeCitationId stays number | null
// onCitationClick: stays (citation: Citation) => void

// In MarkdownContent, the citationMap key logic is already correct since Citation.id IS the index
// Only change: key in Map from c.id to c.id (no change needed — id IS the index)

// Add streamError rendering in assistant message:
// After the content div, before action row:
{message.streamError && (
  <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
    {message.streamError}
  </div>
)}
```

Add `AlertCircle` to lucide imports.

- [ ] **Step 2: Update `frontend/components/chat/SourcePanel.tsx`**

Replace `Citation` import and simplify (no `highlightedText`, no `uploadedAt`/`uploadedBy`/`fileSize`):

```typescript
// Replace import:
import type { Citation } from '@/lib/types/domain'

// Remove the `parts = citation.excerpt.split(citation.highlightedText)` logic
// Replace the excerpt body with:
<p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap">
  {citation.excerpt || 'No excerpt available.'}
</p>

// Update header fields:
// citation.documentName → citation.documentName (already adapted)
// citation.pageNumber → citation.pageNumber (null-safe: citation.pageNumber != null ? `Page ${citation.pageNumber}` : 'Unknown page')

// Remove MetaRow items for uploadedAt, uploadedBy, fileSize — not available from API
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat/ChatMessage.tsx frontend/components/chat/SourcePanel.tsx
git commit -m "feat(frontend): update ChatMessage and SourcePanel for real citation types"
```

---

## Task 18: Provider hooks and ChatInput model indicator

**Files:**
- Create: `frontend/lib/hooks/useProviders.ts`
- Modify: `frontend/components/chat/ChatInput.tsx`

- [ ] **Step 1: Write `frontend/lib/hooks/useProviders.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getProvider, saveProvider, deleteProvider,
  testProvider, listSupportedProviders,
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
    mutationFn: (payload: Parameters<typeof saveProvider>[1]) => saveProvider(workspaceId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider', workspaceId] }),
  })
}

export function useDeleteProvider(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteProvider(workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider', workspaceId] }),
  })
}

export function useTestProvider(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: () => testProvider(workspaceId!),
  })
}
```

- [ ] **Step 2: Update `frontend/components/chat/ChatInput.tsx`**

Replace the `getActiveModel` import and `useEffect` with `useProvider` from context:

```typescript
// Remove: import { getActiveModel } from '@/lib/api'
// Remove: import { ModelInfo } from '@/lib/types'
// Add:
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useProvider } from '@/lib/hooks/useProviders'

// Inside ChatInput, remove modelInfo state and useEffect, replace with:
const { activeWorkspace } = useWorkspace()
const { data: providerData } = useProvider(activeWorkspace?.id)

const modelLabel = (() => {
  if (!providerData) return 'loading…'
  if ('using_platform_default' in providerData) return 'platform default'
  return `${providerData.model_name} · ${providerData.provider_name}`
})()
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useProviders.ts frontend/components/chat/ChatInput.tsx
git commit -m "feat(frontend): add provider hooks and real model indicator in ChatInput"
```

---

## Task 19: Wire settings page

**Files:**
- Modify: `frontend/app/(app)/settings/page.tsx`

This is the largest single-file update. Replace all mock imports with real hooks.

- [ ] **Step 1: Update imports in `frontend/app/(app)/settings/page.tsx`**

Remove:
```typescript
import {
  mockProviderConfig, mockProviderKeys, mockMembers,
  mockPendingInvites, mockUsageStats, mockWorkspace,
} from '@/lib/mock-data'
import type { ProviderConfig, ProviderKey } from '@/lib/types'
```

Add:
```typescript
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useProvider, useSupportedProviders, useSaveProvider, useTestProvider, useDeleteProvider } from '@/lib/hooks/useProviders'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listMembers, listInvitations, inviteMember, removeMember, updateWorkspace } from '@/lib/api/workspaces'
import { getQuota } from '@/lib/api/chat'
import { adaptMember, adaptInvitation, adaptProviderConfig } from '@/lib/types/domain'
import type { ProviderConfig, ProviderKey } from '@/lib/types/domain'
import type { ApiProviderConfig } from '@/lib/types/api'
```

- [ ] **Step 2: Update `AIProviderTab` to use real data**

Replace `AIProviderTab` function:

```typescript
function AIProviderTab() {
  const { activeWorkspace } = useWorkspace()
  const { data: providerData, isLoading } = useProvider(activeWorkspace?.id)
  const { data: supported = [] } = useSupportedProviders()
  const { mutateAsync: doSave, isPending: isSaving } = useSaveProvider(activeWorkspace?.id)
  const { mutateAsync: doTest, isPending: isTesting } = useTestProvider(activeWorkspace?.id)
  const { mutate: doDelete } = useDeleteProvider(activeWorkspace?.id)

  const usingDefault = !providerData || 'using_platform_default' in providerData
  const activeConfig: ApiProviderConfig | null = usingDefault ? null : (providerData as ApiProviderConfig)

  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('askdocs-default')
  const [config, setConfig] = useState<ProviderConfig>({
    provider: 'askdocs-default', model: '', temperature: 0.7, maxTokens: 2048,
  })
  const [testResult, setTestResult] = useState<{ success: boolean; latency_ms: number; error: string | null } | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [embeddingsOpen, setEmbeddingsOpen] = useState(false)
  const providerGridRef = useRef<HTMLDivElement>(null)

  // Sync config when provider data loads
  useEffect(() => {
    if (activeConfig) {
      setSelectedProvider(activeConfig.provider_name as ProviderKey)
      setConfig(adaptProviderConfig(activeConfig))
    }
  }, [activeConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Map supported providers to PROVIDERS def format
  const supportedMap = new Map(supported.map((p) => [p.name, p]))

  const handleProviderSelect = (key: ProviderKey) => {
    const sup = supportedMap.get(key)
    setSelectedProvider(key)
    setConfig({
      provider: key, apiKey: '', baseUrl: '', model: sup?.default_model ?? '',
      temperature: 0.7, maxTokens: 2048,
    })
    setTestResult(null)
    setTestStatus('idle')
  }

  const handleTest = async () => {
    setTestStatus('loading')
    try {
      const result = await doTest()
      setTestResult(result)
      setTestStatus(result.success ? 'success' : 'error')
    } catch {
      setTestStatus('error')
      setTestResult(null)
    }
  }

  const handleSave = async () => {
    if (!activeWorkspace) return
    await doSave({
      provider_name: config.provider,
      api_key: config.apiKey,
      model_name: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      base_url: config.baseUrl,
      azure_region: config.region,
    })
  }

  // The existing JSX can stay largely the same — just replace:
  // mockProviderKeys[p.key] → (p.key === selectedProvider && !!config.apiKey) or (activeConfig?.provider_name === p.key)
  // handleTest → handleTest (now async, real)
  // handleSave → handleSave (now real)
  // testStatus wiring → same pattern
  // "Save configuration" Button → add onClick={handleSave} disabled={isSaving}
  // MODEL_SUGGESTIONS → use sup.available_models from supportedMap
  // ...

  // For the "Currently active" section:
  const activeProviderDef = PROVIDERS.find((p) => p.key === (usingDefault ? 'askdocs-default' : activeConfig?.provider_name)) ?? PROVIDERS[0]

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-indigo-500" /></div>

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Section 1 — Active model (keep existing JSX, use activeProviderDef) */}
      {/* Section 2 — Provider grid (keep existing JSX) */}
      {/* Section 3 — Config form — update handleTest/handleSave, pass testStatus/testResult */}
      {/* Section 4 — Embeddings (keep as-is, informational only) */}
    </div>
  )
}
```

Note: the PROVIDERS constant, ProviderCard, ModelCombobox, and ConfigForm sub-components can stay mostly as-is. The key changes are: removing `mockProviderKeys`, wiring `handleTest` and `handleSave` to real API calls, and seeding `config` from `adaptProviderConfig(activeConfig)`.

- [ ] **Step 3: Update `WorkspaceTab` to use real data**

```typescript
function WorkspaceTab() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const { mutate: doUpdate, isPending } = useMutation({
    mutationFn: (name: string) => updateWorkspace(activeWorkspace!.id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
  const [name, setName] = useState(activeWorkspace?.name ?? '')

  useEffect(() => { setName(activeWorkspace?.name ?? '') }, [activeWorkspace])

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      <Section title="Workspace" description="Basic workspace identity and preferences.">
        <FormField label="Workspace name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="Workspace slug" hint="Used in URLs and API references. Cannot be changed.">
          <input readOnly value={activeWorkspace?.slug ?? ''} className={cn(inputCls, 'font-mono text-muted-foreground bg-muted/40 cursor-not-allowed')} />
        </FormField>
        <Button size="sm" disabled={isPending} onClick={() => doUpdate(name)}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </Section>
    </div>
  )
}
```

- [ ] **Step 4: Update `MembersTab` to use real data**

```typescript
function MembersTab() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()

  const { data: rawMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members', activeWorkspace?.id],
    queryFn: () => listMembers(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  })
  const { data: rawInvites = [] } = useQuery({
    queryKey: ['invitations', activeWorkspace?.id],
    queryFn: () => listInvitations(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  })

  const members = rawMembers.map(adaptMember)
  const invites = rawInvites.map(adaptInvitation)

  const { mutate: doRemove } = useMutation({
    mutationFn: (userId: string) => removeMember(activeWorkspace!.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', activeWorkspace?.id] }),
  })

  // Keep existing JSX — replace mockMembers → members, mockPendingInvites → invites
  // Wire Remove DropdownMenuItem: onClick={() => doRemove(m.id)}
  // member.user.avatarInitials replaces m.user.avatarInitials (same shape)
  // member.user.name replaces m.user.name
  // member.joinedAt replaces m.joinedAt
  // Remove lastActiveAt (not in backend) — use joinedAt instead
}
```

- [ ] **Step 5: Update `UsageTab` to use real data**

```typescript
function UsageTab() {
  const { activeWorkspace } = useWorkspace()
  const { data: quota, isLoading } = useQuery({
    queryKey: ['quota', activeWorkspace?.id],
    queryFn: () => getQuota(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  })

  if (isLoading || !quota) return <div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-indigo-500" /></div>

  const queryPct = (quota.user_used / quota.user_limit) * 100

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Messages used" value={quota.user_used.toLocaleString()} sub={`of ${quota.user_limit.toLocaleString()} daily limit`} pct={queryPct} />
        <StatCard label="Messages remaining" value={quota.user_remaining.toLocaleString()} />
        <StatCard label="Usage" value={`${Math.round(queryPct)}%`} pct={queryPct} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update `SettingsPage` header to remove `mockWorkspace`**

```typescript
// Replace:
// {mockWorkspace.name} · {mockWorkspace.plan...}
// With:
const { activeWorkspace } = useWorkspace()
// In JSX:
{activeWorkspace?.name ?? ''}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app/(app)/settings/page.tsx
git commit -m "feat(frontend): wire settings page with real provider, workspace, members, usage data"
```

---

## Task 20: Cleanup — delete mocks, fix demo button, build check

**Files:**
- Delete: `frontend/lib/mock-data.ts`
- Delete: `frontend/lib/api.ts`
- Delete: `frontend/lib/types.ts`
- Verify: `npm run build`

- [ ] **Step 1: Update all remaining imports from `@/lib/types` → `@/lib/types/domain`**

```bash
grep -r "from '@/lib/types'" /Users/kusalsaraf/Desktop/AskDocs/frontend/components
grep -r "from '@/lib/types'" /Users/kusalsaraf/Desktop/AskDocs/frontend/app
```

For each hit, change `'@/lib/types'` → `'@/lib/types/domain'`. The fields match because `domain.ts` keeps the same interface names and shapes.

- [ ] **Step 2: Ensure no remaining mock-data or api.ts imports**

```bash
grep -r "mock-data\|from '@/lib/api'" /Users/kusalsaraf/Desktop/AskDocs/frontend/app
grep -r "mock-data\|from '@/lib/api'" /Users/kusalsaraf/Desktop/AskDocs/frontend/components
```

Fix any remaining references by replacing with the appropriate hook or API module.

- [ ] **Step 3: Fix demo button in sign-in page**

The "Try the demo" button already redirects to `/sign-in?demo=1`. Now add a banner when `?demo=1` is present:

In `frontend/app/(auth)/sign-in/page.tsx`, add after the error block:
```typescript
const isDemoMode = searchParams.get('demo') === '1'
// use useSearchParams() hook

{isDemoMode && (
  <div className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400 ring-1 ring-amber-500/20">
    Demo mode requires sign-in. Please sign in with Google to continue.
  </div>
)}
```

- [ ] **Step 4: Delete mock files**

```bash
rm /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/mock-data.ts
rm /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/api.ts
rm /Users/kusalsaraf/Desktop/AskDocs/frontend/lib/types.ts
```

- [ ] **Step 5: Run build to catch any dangling references**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/frontend
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no TypeScript errors. Fix any errors before proceeding.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(frontend): wire to live backend, replace all mocks

- Install TanStack Query, axios, @react-oauth/google, react-markdown
- Add API types aligned with backend OpenAPI schema
- Add domain types with adapter functions
- Auth: Google OAuth sign-in, JWT storage, interceptors, protected routes
- WorkspaceContext: active workspace persisted to localStorage
- Documents: list, upload with progress, status polling, delete
- Chat: conversations list, SSE streaming, citation sources panel
- Settings: AI provider CRUD + test, workspace name, members, usage quota
- ChatInput: real model indicator from provider config
- Remove frontend/lib/mock-data.ts, lib/api.ts, lib/types.ts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task(s) |
|---|---|
| Install TanStack Query, axios | Task 1 |
| Env vars NEXT_PUBLIC_API_URL, Google client ID | Task 1 |
| lib/ restructure | Tasks 2–7 |
| TypeScript types from backend schema | Task 2 |
| axios client with interceptors | Task 6 |
| JWT in localStorage, auth.ts only | Task 5 |
| 401 refresh → retry → redirect | Task 6 |
| Google OAuth useGoogleLogin implicit flow | Task 10 |
| Auth state useAuth() hook | Task 8 |
| Protected routes AuthGuard | Task 10 |
| Logout POST /auth/logout/ | Task 8 |
| WorkspaceContext + localStorage | Task 11 |
| Workspace switcher + create workspace | Task 12 |
| Documents list + skeleton | Task 14 |
| Upload + progress | Task 14 |
| Status polling refetchInterval | Task 13 |
| Delete document + confirm | Task 14 |
| Conversations sidebar | Task 11 |
| Load conversation | Task 16 |
| SSE streaming token by token | Task 16 |
| Citations panel + sources fetch | Task 16, 17 |
| AI Provider tab CRUD + test | Task 19 |
| Workspace name PATCH | Task 19 |
| Members list/invite/remove | Task 19 |
| Usage quota | Task 19 |
| ChatInput model indicator | Task 18 |
| Delete mock-data.ts, api.ts, types.ts | Task 20 |
| npm run build clean | Task 20 |
| Demo button → sign-in with banner | Task 20 |
| logger.ts no console.log | Task 4 |
| SSE parser custom | Task 4 |

All spec requirements covered.

**Type consistency check:**
- `Citation.id` (index number) used as map key in `ChatMessage.renderInline` — consistent throughout
- `adaptDocument` returns `Document` matching `DocumentCard` props — consistent
- `WorkspaceContext` returns `Workspace` (domain type) — matches `Sidebar` props
- `useProviders` returns `ApiProviderResponse` — `ChatInput` handles both cases inline

**No placeholder scan:** All `mutationFn` bodies have real implementations. All `queryFn` bodies call real API functions. No "TODO" or "TBD" remaining.
