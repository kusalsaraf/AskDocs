# Frontend ↔ Backend Integration Design

**Date:** 2026-06-02
**Status:** Approved
**Scope:** Replace all mock data in `frontend/lib/` with real API calls to the Django backend at `http://localhost:8000/api/v1/`.

---

## 1. Goals

- Every screen works end-to-end against the live backend — no mock data remaining.
- TypeScript strict: every function signature typed, types derived from backend API contract.
- TanStack Query owns all server state (reads via `useQuery`, writes via `useMutation`).
- Streaming chat uses native `fetch` + `ReadableStream`; no library.
- Auth is self-contained: one module reads/writes tokens, interceptors handle refresh.
- Active workspace flows through a single React context, persisted to localStorage.
- `frontend/lib/mock-data.ts` deleted entirely at the end.

---

## 2. Dependencies to Install

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools axios @react-oauth/google react-markdown
```

No other new dependencies. `lucide-react` and `shadcn/ui` are already installed.

---

## 3. Environment Variables

**`frontend/.env.local`** (gitignored — create, never commit):
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=284246838643-fl418bq8ekc7tm6fg06urft2bl9lt113.apps.googleusercontent.com
```

**`frontend/.env.example`** (committed — update with placeholder values):
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

---

## 4. File Structure

Replaces the flat `frontend/lib/api.ts` + `frontend/lib/mock-data.ts` with:

```
frontend/lib/
  api/
    client.ts          — axios instance, base URL from NEXT_PUBLIC_API_URL, interceptors
    auth.ts            — token r/w (only place that touches localStorage for tokens)
    users.ts           — GET /me/
    workspaces.ts      — workspaces CRUD, members, invitations
    documents.ts       — upload, list, delete, status detail
    providers.ts       — provider config CRUD + test connection
    chat.ts            — conversations CRUD + streaming message send
  hooks/
    useAuth.ts         — auth state: { user, isLoading, isAuthenticated, login, logout }
    useWorkspace.ts    — active workspace from WorkspaceContext
    useDocuments.ts    — TanStack Query hooks for documents
    useChat.ts         — TanStack Query hooks for conversations + messages
    useProviders.ts    — TanStack Query hooks for providers
  contexts/
    WorkspaceContext.tsx  — active workspace state, persisted to localStorage
  types/
    api.ts             — TypeScript types matching backend serializers
    domain.ts          — frontend-only types (streaming state, UI state)
  utils/
    sse.ts             — custom SSE parser for streaming chat
    format.ts          — keep existing date/size formatters (no changes)
  logger.ts            — thin wrapper: console.* in dev, no-op in production
```

**`frontend/lib/types.ts`** (existing flat file) is deleted; all imports updated to `lib/types/api` or `lib/types/domain`.

---

## 5. TypeScript Types (`lib/types/api.ts`)

Derived from backend serializers and API reference. Key types:

```typescript
// Auth
interface TokenPair { access: string; refresh: string }
interface GoogleAuthRequest { access_token: string }

// User & Workspace
interface User {
  id: string; email: string; first_name: string; last_name: string;
  display_name: string; avatar_url: string | null;
}
interface Workspace {
  id: string; name: string; slug: string; is_personal: boolean;
  role: 'admin' | 'member' | 'viewer'; member_count: number; created_at: string;
}
interface MeResponse { user: User; workspaces: Workspace[] }

// Documents
type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed'
interface Document {
  id: string; filename: string; file_size_bytes: number; mime_type: string;
  status: DocumentStatus; error_message: string;
  uploaded_by: Pick<User, 'id' | 'display_name'>; created_at: string; updated_at: string;
}

// Provider
interface ProviderConfig {
  provider_name: string; model_name: string; api_key_last_4: string;
  base_url: string | null; azure_region: string | null;
  temperature: number; max_tokens: number;
  last_test_status: 'ok' | 'error' | 'untested'; last_tested_at: string | null; last_test_error: string;
}
interface PlatformDefault { using_platform_default: true }
type ProviderResponse = ProviderConfig | PlatformDefault

interface SupportedProvider {
  name: string; display_name: string; requires_api_key: boolean;
  supports_base_url: boolean; default_model: string; available_models: string[];
}

interface TestConnectionResult { success: boolean; latency_ms: number; model_echo: string; error: string | null }

// Conversations & Messages
interface ConversationSummary {
  id: string; title: string; last_message_at: string; message_count: number;
}
interface Citation { chunk_id: string; document_id: string; document_filename: string; page_number: number | null; excerpt: string }
interface Message {
  id: string; role: 'user' | 'assistant'; content: string;
  citations: Citation[]; created_at: string;
}
interface Conversation {
  id: string; title: string; messages: Message[];
  created_at: string; last_message_at: string;
}

// Quota
interface QuotaResponse { user_limit: number; user_used: number; user_remaining: number }

// SSE stream events
type SSEEvent =
  | { type: 'token';    delta: string }
  | { type: 'complete'; message_id: string; citations: Record<string, string>; is_cached: boolean }
  | { type: 'error';    code: string; message: string }
```

---

## 6. API Client (`lib/api/client.ts`)

Single axios instance:
- `baseURL` = `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'`
- Request interceptor: reads `askdocs_access_token` from localStorage, injects `Authorization: Bearer <token>` if present.
- Response interceptor:
  - On 401: attempts one token refresh via `POST /auth/token/refresh/` using `askdocs_refresh_token`.
  - On refresh success: stores new tokens, retries the original request once.
  - On refresh failure or missing refresh token: clears both tokens from localStorage, redirects to `/sign-in`.
  - All other errors: re-throw as-is.

`lib/api/auth.ts` is the only module that reads/writes the two localStorage keys. The interceptor calls functions from `auth.ts` — it does not touch localStorage directly.

---

## 7. Authentication (Phase 2)

### Sign-in flow
1. `@react-oauth/google` `GoogleProvider` wraps `app/layout.tsx` with the client ID.
2. Sign-in page uses `useGoogleLogin({ flow: 'implicit', onSuccess })`. On success, the callback receives `{ access_token }`.
3. POST `{ access_token }` to `/auth/google/` → receive `{ access, refresh }`.
4. `auth.ts` stores both tokens.
5. Fetch `/me/` to populate user + workspace list.
6. Redirect to `/chat`.

### Auth state (`hooks/useAuth.ts`)
- Returns `{ user, isLoading, isAuthenticated, login, logout }`.
- On mount with a stored access token, calls `useQuery` to fetch `/me/`; sets `isAuthenticated: true` on success, `false` on 401.
- `logout()`: POSTs `/auth/logout/` with refresh token, then clears tokens and navigates to `/sign-in`.

### Protected route guard
Client component wrapping `(app)/layout.tsx`:
- `isLoading` → full-page skeleton.
- Not authenticated → `router.replace('/sign-in')`.
- Authenticated → renders children.

---

## 8. Workspace Context (Phase 3)

`WorkspaceContext` lives at `(app)/layout.tsx` (mounts once, wraps all app routes).

**State:** `{ activeWorkspace: Workspace | null, workspaces: Workspace[], setActiveWorkspace: (ws: Workspace) => void }`

**Initialization:**
1. Read `askdocs_active_workspace` from localStorage.
2. Cross-reference against the workspace list from `useAuth()`.
3. Default: first workspace with `is_personal: true`, or first in list.
4. `setActiveWorkspace` updates state + persists to localStorage.

**Workspace switcher:** reads from context. "Create workspace…" opens a modal → POST `/workspaces/` → invalidates workspace list → switches to new workspace.

All workspace-scoped hooks (`useDocuments`, `useChat`, `useProviders`) read `activeWorkspace.id` from context.

---

## 9. Documents (Phase 4)

### List
`useDocuments(workspaceId)` → `useQuery(['documents', workspaceId], () => api.documents.list(workspaceId))`.
- Loading: 6 skeleton cards.
- Empty: existing empty-state UI.
- Error: error card with retry button (calls `refetch()`).

### Upload
`useMutation` → `POST /workspaces/{id}/documents/` multipart. Axios `onUploadProgress` feeds a progress bar in the upload modal. On success: invalidate `['documents', workspaceId]`.

### Status polling
After upload, any document with `status === 'processing'` or `status === 'pending'` triggers a `useQuery` with `refetchInterval: (data) => (data?.status === 'ready' || data?.status === 'failed') ? false : 3000`. Polling stops automatically on terminal state.

### Delete
Kebab menu → confirm modal → `useMutation` → `DELETE /workspaces/{id}/documents/{doc_id}/` → invalidate documents list.

---

## 10. Chat (Phase 5)

### Conversations list
`useQuery(['conversations', workspaceId])` → sorted by `last_message_at` desc. "New chat" → `useMutation` POST, switch to new conversation.

### Load conversation
`useQuery(['conversation', workspaceId, conversationId])` → renders all messages with citations.

### Streaming message send
1. Optimistically append user message to local state.
2. Show "thinking" placeholder for assistant message.
3. Open native `fetch` with `Authorization` header and `Accept: text/event-stream`.
4. Pipe `response.body` through `lib/utils/sse.ts` parser.
5. On `token` event: append delta to assistant message content in local state → React re-renders incrementally.
6. On `complete` event: attach citation map to message, mark complete.
7. On `error` event: replace placeholder with inline error.
8. After stream closes: invalidate `['conversations', workspaceId]` to refresh sidebar title + timestamp.

**`lib/utils/sse.ts`** — pure function: takes a `ReadableStream<Uint8Array>`, yields `SSEEvent` objects via async generator. Splits on `\n\n`, parses `event:` and `data:` lines, JSON-parses data. Handles partial chunks via a buffer.

### Citations panel
Click `[N]` badge → fetch `/conversations/{id}/messages/{msgId}/sources/` → render in `SourcePanel` component.

---

## 11. Settings — AI Provider (Phase 6)

- `useProviders(workspaceId)`: fetches current config (`GET /provider/`) + supported list (`GET /providers/supported/`). Supported list cached with `staleTime: Infinity`.
- Platform default state: when response is `{ using_platform_default: true }`, show "Using AskDocs platform default".
- Provider selection → show config form with fields for that provider (`model_name`, `api_key`, `base_url` if applicable).
- "Test Connection" → `useMutation` POST `/provider/test/` → show inline result (latency, success/error).
- "Save" → `useMutation` PUT `/provider/` → invalidate provider query → chat input model indicator updates.
- Other settings tabs: workspace name `PATCH /workspaces/{id}/`, members list/invite/role-change, usage `GET /chat/quota/`.

---

## 12. Error Handling

- **Component error boundaries**: each page route (`chat`, `documents`, `settings`) wrapped in an `ErrorBoundary` that shows an actionable error UI, not a crash screen.
- **Query errors**: `useQuery`'s `isError` state renders error cards with a `refetch()` retry button — never empty/silent.
- **Mutation errors**: surfaced inline (upload modal, test connection button, save button) — not toasts.
- **Auth errors** (401 anywhere): handled by axios interceptor as described in Section 6.
- **Stream errors**: `error` SSE event renders an inline error in the assistant message bubble.

---

## 13. Loading States

Every async UI has explicit loading:
- List pages: skeleton cards (document grid: 6 skeletons; conversation list: 4 skeletons).
- Full-page auth check: full-page skeleton.
- Streaming: "thinking" placeholder that transforms into streamed content.
- Buttons with in-flight mutations: disabled + spinner.

---

## 14. Logger (`lib/logger.ts`)

```typescript
const isProd = process.env.NODE_ENV === 'production'
export const logger = {
  log:   isProd ? () => {} : console.log.bind(console),
  warn:  isProd ? () => {} : console.warn.bind(console),
  error: isProd ? () => {} : console.error.bind(console),
}
```

No `console.log` in shipped code — all logging goes through `logger`.

---

## 15. Cleanup (Phase 7)

- Delete `frontend/lib/mock-data.ts`.
- Delete `frontend/lib/api.ts` (replaced by `lib/api/` directory).
- Delete `frontend/lib/types.ts` (replaced by `lib/types/api.ts` + `lib/types/domain.ts`).
- Run `npm run build` to catch any dangling imports.
- Verify theme persistence (next-themes localStorage — should already work).
- "Try the demo" on landing page → redirect to `/sign-in` with a banner.

---

## 16. Implementation Phases

| Phase | Scope |
|-------|-------|
| 1 | Install deps, env vars, lib/ restructure, TypeScript types |
| 2 | Auth: Google OAuth sign-in, JWT storage, /me check, protected routes, logout |
| 3 | WorkspaceContext, workspace switcher, create workspace |
| 4 | Documents: list, upload + progress, status polling, delete |
| 5 | Chat: conversations list, load, send + SSE stream, citations panel |
| 6 | Settings: provider tab, workspace name, members, usage quota |
| 7 | Delete mock files, build check, model indicator, demo button |

---

## 17. Verification Checklist

- [ ] `http://localhost:3000` loads marketing page
- [ ] "Continue with Google" → real Google popup → lands on `/chat` signed in
- [ ] Sidebar shows real workspaces and real user info
- [ ] Workspace switcher updates page state
- [ ] Documents tab: empty state for new workspace
- [ ] Upload PDF → progress bar → status transitions UPLOADED → PROCESSING → READY without page refresh
- [ ] "New chat" → empty chat opens
- [ ] Ask question → response streams token by token → citations appear inline
- [ ] Click citation → source panel opens
- [ ] Settings → AI Provider → switch to OpenAI with key → Test Connection → Save → chat input updates
- [ ] Sign out → redirected to `/sign-in` → tokens cleared
