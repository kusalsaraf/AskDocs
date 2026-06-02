# Invite Flow — Design Spec
**Date:** 2026-06-02  
**Status:** Approved

---

## Overview

Complete the workspace invitation flow end-to-end:
1. Admin sends invite → Resend delivers an email with an accept link
2. Invitee clicks link → standalone accept page handles all auth states
3. Settings page exposes a copy-link button on each pending invite row

---

## Architecture

### Backend

**New dependency:** `resend` Python SDK added to `requirements.txt`.

**New file: `apps/core/email.py`**  
Thin wrapper around the Resend SDK. Single public function:
```python
send_invitation_email(to: str, workspace_name: str, inviter_name: str, accept_url: str) -> None
```
Reads `RESEND_API_KEY` from settings. Sends a minimal HTML email. No-ops (logs warning) if `RESEND_API_KEY` is not set, so dev environments without a key don't crash.

**Settings changes (`config/settings/base.py`)**
- `RESEND_API_KEY = env("RESEND_API_KEY", default="")`
- `RESEND_FROM_EMAIL = env("RESEND_FROM_EMAIL", default="onboarding@resend.dev")`
- `FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")`

**`apps/workspaces/services.py` — `create_invitation`**  
After `get_or_create`, if the invitation was newly created (`created=True`), call `send_invitation_email`. Accept URL format:
```
{FRONTEND_URL}/invite/{token}?workspace={workspace_name}&inviter={inviter_display_name}
```

No new backend endpoints. `/invitations/{token}/accept/` already handles the POST.

---

### Frontend — Accept Page

**Route:** `app/invite/[token]/page.tsx`  
Standalone page — no `(app)` auth guard, no `(auth)` layout. Uses its own minimal centered-card layout matching the sign-in page aesthetic.

**On mount logic:**
```
read auth state from AuthContext
if authed:
  → call accept() immediately
else:
  → store token in localStorage('pending_invite')
  → show unauthenticated UI with Google sign-in button
```

**`AuthContext` change:**  
After `loginWithGoogle` resolves successfully, check `localStorage('pending_invite')`. If present: call `POST /invitations/{token}/accept/`, clear the key, then `router.replace('/chat')`. If absent: existing `router.replace('/chat')` behaviour unchanged.

**Page states:**

| State | Trigger | UI |
|---|---|---|
| `loading` | Auth state not yet resolved | Spinner |
| `unauthenticated` | Not logged in | Workspace name + inviter from URL params, Google sign-in button |
| `accepting` | Logged in, calling API | Spinner "Joining workspace…" |
| `success` | 2xx from accept | Redirect to `/chat` (no visible state) |
| `already_member` | 400 `already_accepted` from API | Checkmark + "You're already in [Workspace]" + "Go to workspace →" |
| `invalid` | 404 from API | "This invite link is invalid or has expired" |
| `error` | Any other error | "Something went wrong" + retry button |

**New API function:** `acceptInvitation(token: string): Promise<void>` in `lib/api/workspaces.ts`  
Calls `POST /api/v1/invitations/{token}/accept/`.

---

### Frontend — Copy Link Button

**`lib/types/domain.ts` — `adaptInvitation`**  
Add `token` field to `PendingInvite` type and map from `api.token`.

**`lib/types/api.ts` — `ApiPendingInvitation`**  
Add `token: string` field (UUID, already returned by the backend `InvitationSerializer`).

**Settings page — pending invites section**  
Each invite row gets a clipboard icon button (lucide `Copy`). On click:
- Copies `${window.location.origin}/invite/${inv.token}` to clipboard
- Swaps icon to `Check` for 2 seconds (same pattern as `ChatMessage` copy button)

---

## Error Handling

- `send_invitation_email` failure: log the error but do **not** fail the invitation creation — the invite record is still created and the admin can copy the link manually.
- `RESEND_API_KEY` not set: log a warning, skip sending. Invite still created.
- Duplicate invite (`get_or_create` returns existing): email is **not** re-sent (only sent on `created=True`).
- Accept page: all API errors are caught and mapped to the state table above. No unhandled rejections.

---

## Email Template

Minimal HTML email:
- **Subject:** `You've been invited to join [Workspace] on AskDocs`
- **Body:** Inviter name, workspace name, single CTA button "Accept Invitation", plain-text fallback link below
- **From:** `RESEND_FROM_EMAIL` (default `onboarding@resend.dev`)

---

## Environment Variables Added

| Variable | Required | Default | Description |
|---|---|---|---|
| `RESEND_API_KEY` | Prod only | `""` | Resend API key |
| `RESEND_FROM_EMAIL` | No | `onboarding@resend.dev` | Sender address |
| `FRONTEND_URL` | Yes (prod) | `http://localhost:3000` | Base URL for invite links |

---

## Files Changed

**Backend**
- `requirements.txt` — add `resend`
- `config/settings/base.py` — three new env vars
- `apps/core/email.py` — new file
- `apps/workspaces/services.py` — call email after invite creation

**Frontend**
- `lib/types/api.ts` — add `token` to `ApiPendingInvitation`
- `lib/types/domain.ts` — add `token` to `PendingInvite`, update `adaptInvitation`
- `lib/api/workspaces.ts` — add `acceptInvitation(token)`
- `lib/contexts/AuthContext.tsx` — check `pending_invite` after login
- `app/invite/[token]/page.tsx` — new accept page
- `app/(app)/settings/page.tsx` — copy link button on pending invite rows
