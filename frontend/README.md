# AskDocs — Frontend

Next.js 14 single-page application built with TypeScript, Tailwind CSS, and shadcn/ui. Connects to the Django REST backend via Axios with JWT authentication and streams chat responses via Server-Sent Events.

## Screens

| Screen | Route | Description |
|--------|-------|-------------|
| **Landing** | `/` | Marketing page with feature overview and call-to-action |
| **Sign In** | `/sign-in` | Google OAuth authentication |
| **Chat** | `/chat`, `/chat/[id]` | Conversational RAG interface with real-time token streaming and inline citations |
| **Documents** | `/documents` | Upload, view status, and manage workspace documents (PDF, DOCX, TXT) |
| **Settings** | `/settings` | AI provider config (BYOK), workspace management, member invitations, usage dashboard |
| **Invite** | `/invite/[token]` | Workspace invitation acceptance flow |

## Tech Stack

- **Next.js 14** — App Router with file-based routing
- **TypeScript 5** — Strict mode throughout
- **Tailwind CSS** — Utility-first styling with `tailwind-merge`
- **shadcn/ui** — Radix primitives with consistent design
- **TanStack Query** — Server state management with query key factories
- **Axios** — API client with JWT interceptors and automatic token refresh
- **react-markdown** — Rich message rendering with citation support

## Getting Started

```bash
cp .env.example .env.local    # configure environment variables
npm install
npm run dev                   # runs on http://localhost:3000
```

Requires the backend to be running at the URL specified in `NEXT_PUBLIC_API_URL`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL (default: `http://localhost:8000/api/v1`) |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID for sign-in |

## Project Structure

```
frontend/
├── app/
│   ├── (app)/           → Authenticated routes (chat, documents, settings)
│   ├── (auth)/          → Sign-in page
│   ├── invite/          → Invitation acceptance
│   ├── error.tsx        → Root error boundary
│   ├── layout.tsx       → Root layout with providers
│   └── page.tsx         → Landing / marketing page
├── components/
│   ├── chat/            → ChatMessage, ChatInput, SourcePanel
│   ├── documents/       → DocumentCard, UploadModal, StatusBadge
│   ├── layout/          → Sidebar, WorkspaceSwitcher, ThemeToggle
│   └── ui/              → shadcn/ui primitives (Button, Dialog, etc.)
└── lib/
    ├── api/             → Axios client, auth helpers, chat streaming
    ├── contexts/        → AuthContext, WorkspaceContext
    ├── hooks/           → useChat, useDocuments, useProviders (React Query)
    ├── constants.ts     → Centralized config, routes, query keys
    ├── logger.ts        → Structured logging (error/warn active in production)
    └── utils.ts         → Shared helpers (cn, formatRelativeTime, getApiErrorMessage)
```

For full architecture and design details, see the [root README](../README.md).
