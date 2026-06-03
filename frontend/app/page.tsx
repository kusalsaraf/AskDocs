"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  FileText, Sun, Moon, Menu, X, ArrowRight,
  Building2, Key, Quote, Workflow, ShieldCheck, Gauge,
  UploadCloud, Sparkles, MessageSquare, Lock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";

// ── Nav links with anchor IDs ────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Tech stack", href: "#tech-stack" },
];

const FEATURES = [
  { icon: Building2,   title: "Multi-tenant workspaces", desc: "Complete data isolation between workspaces with per-workspace members, roles, and AI provider configuration." },
  { icon: Key,         title: "Bring your own AI",        desc: "Use OpenAI, Anthropic, or Google Gemini with your own API key. Your keys are encrypted at rest and never shared." },
  { icon: Quote,       title: "Inline source citations",  desc: "Every answer cites the exact passage from your documents. Click any citation to see the source in context." },
  { icon: Workflow,    title: "Async ingestion at scale", desc: "Upload hundreds of documents at once. Background processing means uploads return instantly while indexing runs." },
  { icon: ShieldCheck, title: "Production-grade auth",    desc: "Google OAuth, role-based access control (Admin / Member), workspace invitations, and audit-ready design." },
  { icon: Gauge,       title: "Cost-aware by design",     desc: "Per-user rate limits, global budget caps, and usage tracking. Run on the free tier or scale on your own infra." },
];

const HOW_IT_WORKS = [
  { num: "01", icon: UploadCloud,   title: "Upload your documents", desc: "Drag and drop PDFs, DOCX, or TXT files into your workspace. AskDocs parses, chunks, and indexes them automatically." },
  { num: "02", icon: Sparkles,      title: "Configure your AI",     desc: "Choose your preferred AI provider and paste your API key — or use the built-in default to start immediately. Your key is encrypted and isolated." },
  { num: "03", icon: MessageSquare, title: "Ask anything",          desc: "Your team asks questions in plain English. Every answer is grounded in your documents with inline citations to the source." },
];

const TECH_STACK = ["Next.js 15", "Django", "PostgreSQL + pgvector", "LlamaIndex", "Celery", "Redis", "Docker", "OpenAI", "Anthropic", "Google AI"];

const STATS = [
  { value: "768-dim", label: "Vector embeddings" },
  { value: "<2s", label: "Avg response time" },
  { value: "AES-128", label: "Key encryption" },
  { value: "100%", label: "Source-cited answers" },
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
      "group inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 font-medium text-white transition-all hover:bg-indigo-600 active:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25",
      size === "lg" ? "px-7 py-3.5 text-sm" : "px-4 py-2 text-sm"
    )}>{children}</Link>
  );
}

function GhostBtn({ href, children, size = "md" }: { href: string; children: React.ReactNode; size?: "md" | "lg" }) {
  return (
    <Link href={href} className={cn(
      "inline-flex items-center justify-center rounded-lg border border-border font-medium text-muted-foreground transition-all hover:border-zinc-500 hover:text-foreground hover:bg-muted/30",
      size === "lg" ? "px-7 py-3.5 text-sm" : "px-4 py-2 text-sm"
    )}>{children}</Link>
  );
}

function Section({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("mx-auto max-w-[1200px] px-6", className)}>{children}</section>;
}

function SectionHeading({ title, sub, badge }: { title: string; sub?: string; badge?: string }) {
  return (
    <div className="mb-14 text-center">
      {badge && (
        <span className="mb-4 inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400">
          {badge}
        </span>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Hero chat mock ────────────────────────────────────────────────────────────

function HeroChatMock() {
  return (
    <div className="relative mx-auto mt-20 max-w-4xl">
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-b from-indigo-500/20 via-indigo-500/5 to-transparent blur-xl" />
      <div
        className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/40"
        style={{ transform: "perspective(1800px) rotateX(2deg)" }}
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/40" />
          <div className="mx-auto flex h-5 w-56 items-center justify-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground/60">
            <Lock className="mr-1.5 h-2.5 w-2.5" />
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
                  What&apos;s our refund policy for monthly plans?
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
                    {" "}After this window, refunds are issued at support&apos;s discretion for technical issues or billing errors.
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
                &quot;…subscribers on a monthly billing cycle may request a full refund within fourteen (14) calendar days…&quot;
              </p>
            </div>
            <div className="mt-2 space-y-1.5 opacity-40">
              {["Refund Policy 2026.docx", "Support Handbook.pdf"].map((d) => (
                <div key={d} className="rounded-lg border border-border px-3 py-2">
                  <p className="truncate text-[10px] text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
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

  const scrollTo = useCallback((href: string) => {
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setMobileOpen(false);
    }
  }, []);

  return (
    <header className={cn(
      "sticky top-0 z-50 transition-all duration-200",
      scrolled ? "border-b border-border/80 bg-background/90 backdrop-blur-md" : "bg-transparent"
    )}>
      <div className="mx-auto flex max-w-[1200px] items-center gap-6 px-6 py-3.5">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 shadow-sm shadow-indigo-500/20">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">AskDocs</span>
        </Link>

        {/* Center links */}
        <nav className="hidden flex-1 items-center justify-center gap-7 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <button key={label} onClick={() => scrollTo(href)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </button>
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
            {NAV_LINKS.map(({ label, href }) => (
              <button key={label} onClick={() => scrollTo(href)} className="py-2 text-left text-sm text-muted-foreground hover:text-foreground">
                {label}
              </button>
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
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/chat");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return null;
  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* ── Hero ── */}
      <Section className="pb-32 pt-24 text-center">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-4 py-1.5">
          <Zap className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-medium text-indigo-400">Built for B2B teams · Multi-tenant by design</span>
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
          Chat with your company&apos;s{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            documents
          </span>
          .
          <br className="hidden sm:block" />
          Get answers with{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            sources
          </span>
          .
        </h1>
        <p className="mx-auto mt-6 max-w-[600px] text-base leading-relaxed text-muted-foreground">
          AskDocs lets your team ask natural-language questions about internal documents — policies, contracts, specs — and get cited answers grounded in your actual knowledge base.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <AccentBtn href="/sign-in" size="lg">
            Get started free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </AccentBtn>
          <GhostBtn href="/sign-in" size="lg">Sign in</GhostBtn>
        </div>
        <p className="mt-4 text-xs text-muted-foreground/60">No credit card required · Bring your own AI key</p>
        <HeroChatMock />
      </Section>

      {/* ── Stats strip ── */}
      <div className="border-y border-border/60">
        <Section className="py-10">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── Features ── */}
      <Section id="features" className="py-28 scroll-mt-20">
        <SectionHeading
          badge="Features"
          title="Everything you need, nothing you don't"
          sub="A complete document intelligence platform built for teams that care about accuracy, security, and cost."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 transition-colors group-hover:bg-indigo-500/20">
                <Icon className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── How it works ── */}
      <div className="border-t border-border/60 bg-gradient-to-b from-card/60 to-background">
        <Section id="how-it-works" className="py-28 scroll-mt-20">
          <SectionHeading
            badge="How it works"
            title="Three steps from documents to answers"
          />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ num, icon: Icon, title, desc }, i) => (
              <div key={num} className="relative rounded-xl border border-border bg-card p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 font-mono text-sm font-bold text-indigo-400">
                    {num}
                  </span>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 md:block">
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <Icon className="mb-4 h-8 w-8 text-muted-foreground/40" strokeWidth={1.25} />
                <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── Security highlights ── */}
      <Section className="py-24">
        <SectionHeading
          badge="Security"
          title="Your data stays yours"
          sub="Enterprise-grade security without the enterprise price tag."
        />
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { icon: Lock, text: "API keys encrypted at rest with AES-128 + HMAC" },
            { icon: ShieldCheck, text: "Complete workspace isolation — zero data leakage" },
            { icon: Key, text: "Keys never logged, never exposed in API responses" },
            { icon: Building2, text: "Role-based access: Admin and Member permissions" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 px-4 py-3.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Tech stack ── */}
      <div className="border-t border-border/60">
        <Section id="tech-stack" className="py-24 scroll-mt-20">
          <SectionHeading
            badge="Open stack"
            title="Built on tools you trust"
            sub="No proprietary lock-in. Self-host the entire platform on your own infrastructure."
          />
          <div className="flex flex-wrap items-center justify-center gap-3">
            {TECH_STACK.map((tech) => (
              <span key={tech} className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-indigo-500/30 hover:text-foreground">
                {tech}
              </span>
            ))}
          </div>
        </Section>
      </div>

      {/* ── Final CTA ── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-indigo-500/10 to-indigo-500/5" />
        <Section className="relative py-28 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Stop searching. Start asking.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Set up your workspace in under two minutes. Free to start, your keys stay yours.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <AccentBtn href="/sign-in" size="lg">
              Get started free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </AccentBtn>
          </div>
        </Section>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-[1200px] px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20">
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <span className="text-sm font-semibold text-foreground/70">AskDocs</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="#" className="text-xs text-muted-foreground/60 transition-colors hover:text-foreground/70">Privacy</Link>
              <Link href="#" className="text-xs text-muted-foreground/60 transition-colors hover:text-foreground/70">Terms</Link>
            </div>
            <p className="text-xs text-muted-foreground/40">© 2026 AskDocs</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
