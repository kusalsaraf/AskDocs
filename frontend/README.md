# AskDocs — Frontend

Next.js 14 frontend for AskDocs. Runs entirely on mock data — no backend required to explore the UI.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-black)](https://ui.shadcn.com)

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
frontend/
├── app/
│   ├── (app)/              # Authenticated app shell
│   │   ├── chat/           # Chat list + conversation view
│   │   ├── documents/      # Document library
│   │   ├── settings/       # Workspace, AI provider, members, billing
│   │   └── layout.tsx      # App shell with sidebar
│   ├── (auth)/
│   │   └── sign-in/        # Sign-in page
│   ├── globals.css
│   ├── layout.tsx          # Root layout (fonts, ThemeProvider)
│   └── page.tsx            # Public marketing landing page
├── components/
│   ├── chat/               # ChatMessage, ChatInput, SourcePanel, CitationBadge
│   ├── documents/          # DocumentCard, UploadModal, StatusBadge
│   ├── layout/             # Sidebar, WorkspaceSwitcher, UserMenu, ThemeProvider
│   └── ui/                 # shadcn/ui primitives + RelativeTime
├── lib/
│   ├── types.ts            # TypeScript types
│   ├── mock-data.ts        # Mock data for UI development
│   └── utils.ts            # cn(), formatFileSize(), formatRelativeTime()
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Tech stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v3, shadcn/ui |
| Icons | lucide-react |
| Theming | next-themes (dark/light, class-based) |

## Features implemented

- **Marketing landing page** — hero with HTML/CSS chat mock, features grid, how-it-works, tech stack, CTA, footer
- **Sign-in page** — Google OAuth button (stubbed), demo shortcut, theme toggle
- **Chat** — conversation list in sidebar, message thread with streaming cursor, inline citation badges, source panel
- **Documents** — grid/list view, skeleton loading, upload modal with drag-and-drop, progress bars, file validation, tag input
- **Workspace settings** — AI provider configuration, member management, billing (all with mock data)
- **Dark/light theme** — full semantic color system via CSS variables; every component responds to toggle
