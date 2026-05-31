# AskDocs

> Multi-tenant B2B SaaS for document intelligence. Upload documents, chat with them, with inline source citations.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-black)](https://ui.shadcn.com)

**Live demo:** _coming soon_  
**Loom walkthrough:** _coming soon_

---

## About

AskDocs is a multi-tenant document intelligence platform built for B2B teams. Workspace members can upload internal documents — PDFs, Word files, spreadsheets — and then chat with them using natural language. Every AI response links back to the exact passages it drew from, with inline citations that let users verify answers against the source material.

The platform is built around a BYOK (Bring Your Own Key) model: each workspace configures its own AI provider and credentials. Admins can choose from any of the major providers — OpenAI, Anthropic, Google Gemini, Azure OpenAI, Mistral, Groq, or a self-hosted Ollama instance — and rotate keys at any time without touching the codebase.

This repository contains the Next.js frontend. The Django REST API backend that handles document ingestion, vector storage, and AI orchestration is in a separate repository (coming soon).

---

## Features

- **Multi-tenant workspaces** — isolated document libraries, members, and settings per workspace
- **BYOK AI configuration** — connect any provider: OpenAI, Anthropic, Google Gemini, Azure OpenAI, Mistral, Groq, or Ollama
- **Document library** — upload and manage PDFs, DOCX, and XLSX files with processing status tracking
- **Chat with citations** — every AI answer includes inline source citations with exact excerpts and page numbers
- **Workspace settings** — member management, invites, usage analytics, and billing in one place

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Icons | lucide-react |
| Backend | Django REST Framework _(separate repo, coming soon)_ |

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend runs entirely on mock data — no backend required to explore the UI.

---

## Project Structure

```
AskDocs/
├── app/
│   ├── (app)/
│   │   ├── chat/          # Chat list + conversation view with citations
│   │   ├── documents/     # Document library
│   │   └── settings/      # Workspace, AI provider, members, billing
│   ├── layout.tsx
│   └── page.tsx
├── components/            # Shared UI components
└── lib/
    ├── types.ts           # TypeScript types
    ├── mock-data.ts       # Mock data for UI development
    └── api.ts             # API client (wired to backend when available)
```

---

## Status

This is the **frontend only**. It ships with mock data so every screen is explorable without a live backend. The Django REST backend — document ingestion, embedding pipeline, vector search, AI orchestration — is being built in parallel and will be linked here once it's ready.
