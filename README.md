# AskDocs

Multi-tenant B2B SaaS for document intelligence — chat with your company's documents, with inline source citations.

## Architecture

**Frontend** (`frontend/`) — Next.js 14 App Router application. Handles the full user-facing product: chat interface with streaming responses and inline citations, document management and upload, multi-workspace support, sign-in flow, and the public marketing site. Dark/light theme throughout.

**Backend** (`backend/`) — Django REST API with PostgreSQL + pgvector. Handles multi-tenant workspace isolation, document ingestion and chunking, retrieval-augmented generation (RAG) pipeline, and BYOK AI provider routing. Background processing via Celery + Redis.

## Repository structure

```
AskDocs/
├── frontend/               # Next.js 14 frontend
│   ├── app/                # App Router pages and layouts
│   │   ├── (app)/          # Authenticated app shell (chat, documents, settings)
│   │   ├── (auth)/         # Auth pages (sign-in)
│   │   └── page.tsx        # Public marketing landing page
│   ├── components/         # Shared React components
│   │   ├── chat/           # Chat UI (messages, input, source panel, citations)
│   │   ├── documents/      # Document cards, upload modal, status badges
│   │   ├── layout/         # Sidebar, workspace switcher, user menu, theme provider
│   │   └── ui/             # shadcn/ui primitives
│   ├── lib/                # Types, utilities, mock data
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── backend/                # Django REST API
│   ├── config/             # Django project settings, URLs, Celery
│   ├── apps/               # core, accounts, workspaces, documents, chat, providers
│   └── tests/              # pytest integration tests
├── .gitignore
└── README.md
```

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:3000`.

### Backend

```bash
cd backend
cp .env.example .env
docker compose up --build
```

API at `http://localhost:8000`. Swagger UI at `http://localhost:8000/api/docs/`.

See [`backend/README.md`](backend/README.md) for full setup, test, and lint instructions.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, shadcn/ui, next-themes |
| Backend framework | Django, Django REST Framework |
| Database | PostgreSQL + pgvector |
| AI / RAG | LlamaIndex, OpenAI, Anthropic, Google AI (BYOK) |
| Background jobs | Celery, Redis |
| Infrastructure | Docker, Docker Compose |

## Status

| Part | State |
|---|---|
| **Frontend** | Complete — all screens implemented, dark/light theme, hydration-safe relative timestamps |
| **Backend** | Phase 1 complete — foundation, health endpoint, Docker stack |
