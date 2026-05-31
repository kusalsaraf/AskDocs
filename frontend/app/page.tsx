"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  FileText, Sun, Moon, Menu, X,
  Building2, Key, Quote, Workflow, ShieldCheck, Gauge,
  UploadCloud, Sparkles, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_LINKS = ["Features", "How it works", "Pricing", "Docs"];

const FEATURES = [
  { icon: Building2,   title: "Multi-tenant workspaces", desc: "Complete data isolation between workspaces. Per-workspace members, roles, and AI provider configuration." },
  { icon: Key,         title: "Bring your own AI",        desc: "Use OpenAI, Anthropic, Gemini, Azure, Mistral, Groq, or self-hosted Ollama. Your keys, your data, your control." },
  { icon: Quote,       title: "Inline source citations",  desc: "Every answer cites the exact passage from your documents. Click any citation to see the source in context." },
  { icon: Workflow,    title: "Async ingestion at scale", desc: "Upload hundreds of documents at once. Celery-powered background processing means uploads return instantly." },
  { icon: ShieldCheck, title: "Production-grade auth",    desc: "Google OAuth, role-based access (Admin / Member / Viewer), audit trails. Built for teams, not toys." },
  { icon: Gauge,       title: "Cost-aware by design",     desc: "Per-user rate limits, global budget caps, local embeddings. Run it on free tier, or scale to enterprise on your own infrastructure." },
];

const HOW_IT_WORKS = [
  { num: "01", icon: UploadCloud,   title: "Upload your documents", desc: "Drag and drop PDFs, DOCX, or TXT files into your workspace. AskDocs parses, chunks, and indexes them automatically." },
  { num: "02", icon: Sparkles,      title: "Configure your AI",     desc: "Choose your preferred AI provider and paste your API key, or use AskDocs's free tier to start. Your key is encrypted and isolated to your workspace." },
  { num: "03", icon: MessageSquare, title: "Ask anything",          desc: "Your team asks questions in plain English. Every answer is grounded in your documents with inline citations to source passages." },
];

const TRUST_LOGOS = ["Acme", "Northstar", "Helix", "Prism", "Onyx", "Forge"];

const TECH_STACK = ["Next.js", "Django", "PostgreSQL + pgvector", "LlamaIndex", "Celery", "Redis", "Docker", "OpenAI", "Anthropic", "Google AI"];

const FOOTER_COLS = [
  { heading: "Product",    links: ["Features", "Pricing", "Demo", "Changelog"] },
  { heading: "Developers", links: ["Docs", "API", "GitHub", "Self-hosting"] },
  { heading: "Company",    links: ["About", "Blog", "Contact", "Privacy", "Terms"] },
];

// ── Shared components ─────────────────────────────────────────────────────────

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => mounted && setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className={cn("rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/70", className)}
    >
      {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="block h-4 w-4" />}
    </button>
  );
}

function AccentBtn({ href, children, size = "md" }: { href: string; children: React.ReactNode; size?: "md" | "lg" }) {
  return (
    <Link href={href} className={cn(
      "inline-flex items-center justify-center rounded-lg bg-indigo-500 font-medium text-white transition-colors hover:bg-indigo-600 active:bg-indigo-700",
      size === "lg" ? "px-6 py-3 text-sm" : "px-4 py-2 text-sm"
    )}>{children}</Link>
  );
}

function GhostBtn({ href, children, size = "md" }: { href: string; children: React.ReactNode; size?: "md" | "lg" }) {
  return (
    <Link href={href} className={cn(
      "inline-flex items-center justify-center rounded-lg border border-border font-medium text-muted-foreground transition-colors hover:border-zinc-500 hover:text-foreground",
      size === "lg" ? "px-6 py-3 text-sm" : "px-4 py-2 text-sm"
    )}>{children}</Link>
  );
}

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("mx-auto max-w-[1200px] px-6", className)}>{children}</section>;
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-14 text-center">
      <h2 className="text-2xl font-medium tracking-tight text-foreground">{title}</h2>
      {sub && <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Hero chat mock ────────────────────────────────────────────────────────────

function HeroChatMock() {
  return (
    <div
      className="mx-auto mt-20 max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
      style={{ transform: "perspective(1800px) rotateX(2deg)" }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-muted" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted" />
        <div className="mx-auto flex h-5 w-56 items-center justify-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground/60">
          app.askdocs.ai/chat
        </div>
      </div>

      <div className="flex" style={{ height: 340 }}>
        {/* Sidebar */}
        <div className="hidden w-44 shrink-0 border-r border-border bg-background px-3 py-4 sm:block">
          <div className="flex items-center gap-2 px-1 pb-3">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500">
              <FileText className="h-3 w-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-foreground/70">AskDocs</span>
          </div>
          <div className="space-y-0.5">
            {[["New chat", false], ["Refund policy Q", true], ["Q3 Roadmap", false]].map(([label, active]) => (
              <div key={label as string} className={cn("rounded-md px-2 py-1.5 text-[11px]", active ? "bg-muted text-foreground" : "text-muted-foreground/60")}>
                {label as string}
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-hidden px-5 pt-5">
            {/* User bubble */}
            <div className="flex justify-end">
              <div className="max-w-[72%] rounded-xl rounded-tr-sm bg-indigo-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-foreground ring-1 ring-indigo-500/20">
                What's our refund policy for monthly plans?
              </div>
            </div>

            {/* AI response */}
            <div className="flex gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 ring-1 ring-indigo-500/30">
                <FileText className="h-3 w-3 text-indigo-400" />
              </div>
              <div className="max-w-[82%]">
                <p className="text-xs leading-relaxed text-foreground/70">
                  According to the Customer Agreement, monthly subscribers are eligible for a full refund within{" "}
                  <strong className="text-foreground">14 days</strong> of their billing date
                  {" "}<span className="inline-flex items-center justify-center rounded bg-indigo-500/15 px-1 font-mono text-[10px] font-semibold text-indigo-400 ring-1 ring-indigo-500/20 relative -top-px">1</span>.
                  {" "}After this window, refunds are issued at support's discretion for technical issues or billing errors.
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-rose-500/15">
                    <span className="font-mono text-[8px] font-bold text-rose-400">PDF</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-medium text-foreground/70">Customer Agreement.pdf</p>
                    <p className="text-[10px] text-muted-foreground/60">Section 4.2 · Refund Policy</p>
                  </div>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">p. 12</span>
                </div>
              </div>
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span className="flex-1 text-xs text-muted-foreground/60">Ask a question about your documents…</span>
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/30">
                <MessageSquare className="h-3 w-3 text-indigo-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Source panel */}
        <div className="hidden w-52 shrink-0 border-l border-border bg-background px-3 py-4 lg:block">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Sources</p>
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded bg-rose-500/15 px-1 font-mono text-[8px] font-bold text-rose-400">PDF</span>
              <span className="font-mono text-[10px] font-semibold text-indigo-400">1</span>
            </div>
            <p className="text-[10px] font-medium leading-tight text-foreground/70">Customer Agreement.pdf</p>
            <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed text-muted-foreground/60">
              "…subscribers on a monthly billing cycle may request a full refund within fourteen (14) calendar days…"
            </p>
          </div>
          <div className="mt-2 space-y-1.5 opacity-40">
            {["Refund Policy 2025.docx", "Support Handbook.pdf"].map((d) => (
              <div key={d} className="rounded-lg border border-border px-3 py-2">
                <p className="truncate text-[10px] text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn(
      "sticky top-0 z-50 transition-all duration-200",
      scrolled ? "border-b border-border/80 bg-background/90 backdrop-blur-md" : "bg-transparent"
    )}>
      <div className="mx-auto flex max-w-[1200px] items-center gap-6 px-6 py-3.5">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">AskDocs</span>
        </Link>

        {/* Center links */}
        <nav className="hidden flex-1 items-center justify-center gap-7 md:flex">
          {NAV_LINKS.map((label) => (
            <a key={label} href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</a>
          ))}
        </nav>

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden items-center gap-2 sm:flex">
            <GhostBtn href="/sign-in">Sign in</GhostBtn>
            <AccentBtn href="/sign-in">Get started</AccentBtn>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground/70 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((label) => (
              <a key={label} href="#" className="py-2 text-sm text-muted-foreground hover:text-foreground">{label}</a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <GhostBtn href="/sign-in">Sign in</GhostBtn>
            <AccentBtn href="/sign-in">Get started</AccentBtn>
          </div>
        </div>
      )}
    </header>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* ── Hero ── */}
      <Section className="pb-32 pt-24 text-center">
        <div className="mb-7 inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1 font-mono text-xs text-muted-foreground">
          Built for B2B teams · Multi-tenant by design
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-5xl">
          Chat with your company's documents.
          <br className="hidden sm:block" />
          Get answers with sources.
        </h1>
        <p className="mx-auto mt-6 max-w-[600px] text-base leading-relaxed text-muted-foreground">
          AskDocs lets your team ask natural-language questions about your internal documents — policies, contracts, specs — and get cited answers grounded in your actual knowledge base. Production-grade RAG, BYOK AI provider, multi-tenant from day one.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <AccentBtn href="/sign-in" size="lg">Start free</AccentBtn>
          <GhostBtn href="/chat" size="lg">Try the demo</GhostBtn>
        </div>
        <p className="mt-4 text-xs text-muted-foreground/60">No credit card required · Bring your own AI key</p>
        <HeroChatMock />
      </Section>

      {/* ── Trust strip ── */}
      <div className="border-y border-border/60 py-12">
        <Section>
          <p className="mb-8 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
            Trusted by teams building with AI
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {TRUST_LOGOS.map((name) => (
              <span key={name} className="cursor-default text-sm font-semibold tracking-wide text-muted-foreground/40 transition-colors hover:text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        </Section>
      </div>

      {/* ── Features ── */}
      <Section className="py-28">
        <SectionHeading
          title="Built for production, not demos"
          sub="Everything you need to ship an AI knowledge product to your team or customers"
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-border">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
                <Icon className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── How it works ── */}
      <div className="border-t border-border/60 bg-card/40">
        <Section className="py-28">
          <SectionHeading title="Three steps from documents to answers" />
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ num, icon: Icon, title, desc }) => (
              <div key={num} className="flex flex-col">
                <span className="mb-4 font-mono text-3xl font-semibold text-muted-foreground/20">{num}</span>
                <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                <Icon className="mt-8 h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── Tech stack ── */}
      <Section className="py-24">
        <SectionHeading
          title="Built on a stack you can trust"
          sub="Open architecture, no proprietary lock-in. Self-host the entire platform on your own infrastructure."
        />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TECH_STACK.map((tech, i) => (
            <React.Fragment key={tech}>
              <span className="cursor-default text-sm text-muted-foreground/60 transition-colors hover:text-muted-foreground">{tech}</span>
              {i < TECH_STACK.length - 1 && <span className="text-muted-foreground/20 select-none">·</span>}
            </React.Fragment>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ── */}
      <div className="border-t border-border/60 bg-card/60">
        <Section className="py-28 text-center">
          <h2 className="text-3xl font-medium tracking-tight text-foreground">Stop searching. Start asking.</h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Set up your workspace in under two minutes. Free to start, your keys stay yours.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <AccentBtn href="/sign-in" size="lg">Start free</AccentBtn>
            <GhostBtn href="/chat" size="lg">Try the demo</GhostBtn>
          </div>
        </Section>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
            {FOOTER_COLS.map(({ heading, links }) => (
              <div key={heading}>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{heading}</h4>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-muted-foreground/60 transition-colors hover:text-foreground/70">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social</h4>
              <div className="flex flex-col gap-2.5">
                {["Twitter", "GitHub", "LinkedIn"].map((label) => (
                  <a key={label} href="#" className="text-sm text-muted-foreground/60 transition-colors hover:text-foreground/70">{label}</a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-14 flex items-center justify-between border-t border-border/60 pt-8">
            <p className="text-xs text-muted-foreground/40">© 2026 AskDocs. Open architecture for AI knowledge.</p>
            <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500/20">
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
