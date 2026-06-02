# Invite Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the workspace invitation flow — Resend email on invite creation, standalone accept page, copy-link button in settings.

**Architecture:** Backend gains a thin `apps/core/email.py` Resend wrapper called by `create_invitation` when a new record is created. Frontend adds an `/invite/[token]` route outside all auth guards; `AuthContext` checks `localStorage('pending_invite')` after login to auto-accept; settings page exposes a copy-link button per pending invite.

**Tech Stack:** Python `resend` SDK, Next.js 14 App Router, React, TanStack Query, lucide-react

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/requirements.txt` | Add `resend` dependency |
| Modify | `backend/config/settings/base.py` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL` |
| Create | `backend/apps/core/email.py` | Resend wrapper — `send_invitation_email()` |
| Modify | `backend/apps/workspaces/services.py` | Call email after new invite created |
| Modify | `backend/tests/test_invitations.py` | Test email is sent / not sent on duplicate |
| Modify | `frontend/lib/types/api.ts` | Add `token` + fix `invited_at` on `ApiPendingInvitation` |
| Modify | `frontend/lib/types/domain.ts` | Add `token` to `PendingInvite`, fix `adaptInvitation` |
| Modify | `frontend/lib/api/workspaces.ts` | Add `acceptInvitation(token)` |
| Modify | `frontend/lib/contexts/AuthContext.tsx` | Check `pending_invite` after login |
| Create | `frontend/app/invite/[token]/page.tsx` | Standalone accept page |
| Modify | `frontend/app/(app)/settings/page.tsx` | Copy-link button on pending invite rows |

---

## Task 1: Backend — Resend email service

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/core/email.py`

- [ ] **Step 1: Add resend to requirements**

Add to `backend/requirements.txt`:
```
resend==2.3.0
```

- [ ] **Step 2: Install in running container**

```bash
docker compose exec web pip install resend==2.3.0
```

Expected: `Successfully installed resend-2.3.0`

- [ ] **Step 3: Add env vars to settings**

In `backend/config/settings/base.py`, after the existing `CHAT_MAX_HISTORY_TURNS` line add:

```python
RESEND_API_KEY = env("RESEND_API_KEY", default="")
RESEND_FROM_EMAIL = env("RESEND_FROM_EMAIL", default="onboarding@resend.dev")
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")
```

- [ ] **Step 4: Create email.py**

Create `backend/apps/core/email.py`:

```python
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_invitation_email(
    to: str,
    workspace_name: str,
    inviter_name: str,
    accept_url: str,
) -> None:
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping invitation email to %s", to)
        return

    import resend  # local import so missing package only fails at call time

    resend.api_key = api_key

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">
        You've been invited to join <strong>{workspace_name}</strong>
      </h2>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px">
        {inviter_name} has invited you to collaborate on AskDocs.
      </p>
      <a href="{accept_url}"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500">
        Accept Invitation
      </a>
      <p style="margin-top:20px;font-size:12px;color:#9ca3af">
        Or copy this link: {accept_url}
      </p>
    </div>
    """

    resend.Emails.send({
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to],
        "subject": f"You've been invited to join {workspace_name} on AskDocs",
        "html": html,
    })
```

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/config/settings/base.py backend/apps/core/email.py
git commit -m "feat(backend): add Resend email service"
```

---

## Task 2: Backend — Wire email into create_invitation

**Files:**
- Modify: `backend/apps/workspaces/services.py`
- Modify: `backend/tests/test_invitations.py`

- [ ] **Step 1: Write failing tests**

Add to the end of `backend/tests/test_invitations.py`:

```python
from unittest.mock import patch


def test_invitation_sends_email(admin_client: APIClient, workspace_with_member: Workspace) -> None:
    with patch("apps.core.email.send_invitation_email") as mock_send:
        resp = admin_client.post(
            f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
            {"email": "newperson@example.com", "role": "member"},
            format="json",
        )
    assert resp.status_code == 201
    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args
    assert call_kwargs.kwargs["to"] == "newperson@example.com" or call_kwargs.args[0] == "newperson@example.com"


def test_duplicate_invitation_does_not_resend_email(
    admin_client: APIClient, workspace_with_member: Workspace
) -> None:
    with patch("apps.core.email.send_invitation_email") as mock_send:
        admin_client.post(
            f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
            {"email": "dup@example.com", "role": "member"},
            format="json",
        )
        admin_client.post(
            f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
            {"email": "dup@example.com", "role": "member"},
            format="json",
        )
    assert mock_send.call_count == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec web pytest tests/test_invitations.py::test_invitation_sends_email tests/test_invitations.py::test_duplicate_invitation_does_not_resend_email -v
```

Expected: FAIL — `AssertionError: Expected 'send_invitation_email' to be called once`

- [ ] **Step 3: Update create_invitation in services.py**

In `backend/apps/workspaces/services.py`, update `create_invitation`:

```python
def create_invitation(
    workspace: Any,
    email: str,
    role: str,
    invited_by: Any,
) -> "WorkspaceInvitation":
    from apps.workspaces.models import Membership, WorkspaceInvitation
    from apps.core.email import send_invitation_email
    from django.conf import settings

    if role not in [r.value for r in Membership.Role]:
        raise InsufficientWorkspaceRole(detail=f"Invalid role: {role}")

    invitation, created = WorkspaceInvitation.objects.get_or_create(
        workspace=workspace,
        email=email,
        defaults={"role": role, "invited_by": invited_by},
    )

    if created:
        inviter_name = invited_by.display_name or invited_by.email
        accept_url = (
            f"{settings.FRONTEND_URL}/invite/{invitation.token}"
            f"?workspace={workspace.name}&inviter={inviter_name}"
        )
        send_invitation_email(
            to=email,
            workspace_name=workspace.name,
            inviter_name=inviter_name,
            accept_url=accept_url,
        )

    return invitation
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec web pytest tests/test_invitations.py -v
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/workspaces/services.py backend/tests/test_invitations.py
git commit -m "feat(backend): send Resend email on new workspace invitation"
```

---

## Task 3: Frontend — Type updates (token + invited_at fix)

**Files:**
- Modify: `frontend/lib/types/api.ts`
- Modify: `frontend/lib/types/domain.ts`

- [ ] **Step 1: Add token and fix invited_at in ApiPendingInvitation**

In `frontend/lib/types/api.ts`, replace the `ApiPendingInvitation` interface:

```typescript
export interface ApiPendingInvitation {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  token: string
  invited_at: string
}
```

- [ ] **Step 2: Add token to PendingInvite and fix adaptInvitation**

In `frontend/lib/types/domain.ts`, replace `PendingInvite` and `adaptInvitation`:

```typescript
export interface PendingInvite {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  token: string
  invitedAt: Date
}

export function adaptInvitation(api: ApiPendingInvitation): PendingInvite {
  return {
    id: api.id,
    email: api.email,
    role: api.role,
    token: api.token,
    invitedAt: new Date(api.invited_at),
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/api.ts frontend/lib/types/domain.ts
git commit -m "fix(frontend): add token to PendingInvite, fix invited_at field mapping"
```

---

## Task 4: Frontend — acceptInvitation API function

**Files:**
- Modify: `frontend/lib/api/workspaces.ts`

- [ ] **Step 1: Add acceptInvitation**

In `frontend/lib/api/workspaces.ts`, add after `listInvitations`:

```typescript
export async function acceptInvitation(token: string): Promise<void> {
  await apiClient.post(`/invitations/${token}/accept/`)
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api/workspaces.ts
git commit -m "feat(frontend): add acceptInvitation API function"
```

---

## Task 5: Frontend — AuthContext pending_invite handling

**Files:**
- Modify: `frontend/lib/contexts/AuthContext.tsx`

- [ ] **Step 1: Update loginWithGoogle to check pending_invite**

In `frontend/lib/contexts/AuthContext.tsx`, add the import at the top:

```typescript
import { acceptInvitation } from '@/lib/api/workspaces'
```

Replace the `loginWithGoogle` callback:

```typescript
const loginWithGoogle = useCallback(
  async (googleAccessToken: string) => {
    const { data: tokens } = await apiClient.post<{ access: string; refresh: string }>(
      '/auth/google/',
      { access_token: googleAccessToken }
    )
    setTokens(tokens.access, tokens.refresh)
    setSkipFetch(false)
    await queryClient.invalidateQueries({ queryKey: ['me'] })

    const pendingToken = localStorage.getItem('pending_invite')
    if (pendingToken) {
      localStorage.removeItem('pending_invite')
      try {
        await acceptInvitation(pendingToken)
      } catch {
        // ignore — already a member or token invalid; page will handle state
      }
    }
  },
  [queryClient]
)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/contexts/AuthContext.tsx
git commit -m "feat(frontend): auto-accept pending invite after Google login"
```

---

## Task 6: Frontend — Invite accept page

**Files:**
- Create: `frontend/app/invite/[token]/page.tsx`

- [ ] **Step 1: Create the accept page**

Create `frontend/app/invite/[token]/page.tsx`:

```typescript
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { GoogleLogin } from '@react-oauth/google'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { acceptInvitation } from '@/lib/api/workspaces'

type PageState =
  | 'loading'
  | 'unauthenticated'
  | 'accepting'
  | 'already_member'
  | 'invalid'
  | 'error'

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAuthenticated, isLoading, loginWithGoogle } = useAuth()

  const workspaceName = searchParams.get('workspace') ?? 'a workspace'
  const inviterName = searchParams.get('inviter') ?? 'Someone'

  const [state, setState] = useState<PageState>('loading')

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      localStorage.setItem('pending_invite', params.token)
      setState('unauthenticated')
      return
    }

    setState('accepting')
    acceptInvitation(params.token)
      .then(() => router.replace('/chat'))
      .catch((err) => {
        const status = err?.response?.status
        if (status === 400) {
          setState('already_member')
        } else if (status === 404) {
          setState('invalid')
        } else {
          setState('error')
        }
      })
  }, [isAuthenticated, isLoading, params.token, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {state === 'unauthenticated' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10">
              <span className="text-2xl">✉️</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Join {workspaceName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {inviterName} invited you to collaborate on AskDocs.
                Sign in to accept.
              </p>
            </div>
            <div className="w-full">
              <GoogleLogin
                onSuccess={async (res) => {
                  if (res.credential) {
                    setState('accepting')
                    await loginWithGoogle(res.credential)
                    router.replace('/chat')
                  }
                }}
                onError={() => setState('error')}
                width="100%"
                text="signin_with"
                shape="rectangular"
              />
            </div>
          </div>
        )}

        {state === 'accepting' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-muted-foreground">Joining workspace…</p>
          </div>
        )}

        {state === 'already_member' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
            <div>
              <h1 className="text-base font-semibold text-foreground">
                You're already in {workspaceName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You already have access to this workspace.
              </p>
            </div>
            <button
              onClick={() => router.replace('/chat')}
              className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
            >
              Go to workspace →
            </button>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Invalid invite link
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This invite link is invalid or has expired.
              </p>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Something went wrong
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Could not accept the invitation. Please try again.
              </p>
            </div>
            <button
              onClick={() => {
                setState('accepting')
                acceptInvitation(params.token)
                  .then(() => router.replace('/chat'))
                  .catch(() => setState('error'))
              }}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Note on GoogleLogin credential vs access_token**

The existing sign-in page uses `@react-oauth/google`'s `useGoogleLogin` with `access_token`. The `GoogleLogin` button component returns a JWT `credential` (id_token), not an OAuth `access_token`. The backend `POST /auth/google/` may expect either. Check which flow the backend uses:

```bash
grep -r "google" /Users/kusalsaraf/Desktop/AskDocs/backend/config/settings/base.py
grep -r "SOCIALACCOUNT\|google" /Users/kusalsaraf/Desktop/AskDocs/backend/config/settings/base.py | head -10
```

If the backend expects `access_token` (OAuth2 flow, not ID token), import `useGoogleLogin` instead and use the same pattern as `app/(auth)/sign-in/page.tsx`. Replace the `<GoogleLogin>` block in the accept page with:

```typescript
import { useGoogleLogin } from '@react-oauth/google'

// inside component:
const handleGoogleLogin = useGoogleLogin({
  onSuccess: async (tokenResponse) => {
    setState('accepting')
    await loginWithGoogle(tokenResponse.access_token)
    router.replace('/chat')
  },
  onError: () => setState('error'),
})

// in JSX, replace <GoogleLogin> with:
<button
  onClick={() => handleGoogleLogin()}
  className="w-full flex items-center justify-center gap-3 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
>
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
  Sign in with Google
</button>
```

- [ ] **Step 3: Verify the page renders**

Start the frontend dev server if not running and navigate to `http://localhost:3000/invite/test-token?workspace=TestWS&inviter=Alice`. Should see the unauthenticated state card with workspace name and sign-in button.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/invite/[token]/page.tsx
git commit -m "feat(frontend): add invite accept page"
```

---

## Task 7: Frontend — Copy link button in settings

**Files:**
- Modify: `frontend/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add Copy and Check to lucide imports**

Find the lucide-react import line in `frontend/app/(app)/settings/page.tsx` and add `Copy` and `Check` to it (they may already exist — if so, skip):

```typescript
import { ..., Copy, Check } from 'lucide-react'
```

- [ ] **Step 2: Add CopyLinkButton component**

Add this component just before the closing of the file (after the last helper component):

```typescript
function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    const url = `${window.location.origin}/invite/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy invite link"
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-400" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
```

- [ ] **Step 3: Add CopyLinkButton to each pending invite row**

Find the pending invites row in the settings page (the `<div>` containing `inv.email` and `<RoleBadge>`). Replace it with:

```typescript
<div
  key={inv.id}
  className={cn(
    'flex items-center justify-between px-4 py-3 gap-4',
    i < invites.length - 1 && 'border-b border-border/50'
  )}
>
  <div>
    <span className="font-mono text-sm text-muted-foreground italic">{inv.email}</span>
    <span className="ml-3 text-xs text-muted-foreground/60">
      {formatRelativeTime(inv.invitedAt)}
    </span>
  </div>
  <div className="flex items-center gap-2">
    <RoleBadge role={inv.role} />
    <CopyLinkButton token={inv.token} />
  </div>
</div>
```

- [ ] **Step 4: Verify in browser**

Open Settings → Members tab. Each pending invite row should have a clipboard icon on the right. Clicking it should copy the invite URL and briefly show a green checkmark.

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/settings/page.tsx"
git commit -m "feat(frontend): add copy invite link button to pending invites"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Set RESEND_API_KEY in backend .env**

Add to `backend/.env`:
```
RESEND_API_KEY=re_your_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev
FRONTEND_URL=http://localhost:3000
```

Get a free API key at resend.com (free tier: 3,000 emails/month).

- [ ] **Step 2: Restart backend to pick up env vars**

```bash
docker compose restart web
```

- [ ] **Step 3: Full flow test**

1. Log in as admin → Settings → Members → invite a real email address
2. Check that email arrives with "Accept Invitation" button
3. Click the link → should see the unauthenticated accept card with workspace name
4. Sign in with Google → should land in `/chat` with the new workspace active
5. Try clicking the same link again → should see "You're already a member" state

- [ ] **Step 4: Copy link test**

1. Settings → pending invite row → click clipboard icon
2. Paste in a browser → verify it navigates to `/invite/{token}?workspace=...`

- [ ] **Step 5: Run backend tests**

```bash
docker compose exec web pytest tests/test_invitations.py -v
```

Expected: all PASS
