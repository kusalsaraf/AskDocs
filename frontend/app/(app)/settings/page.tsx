"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronRight,
  Loader2, UserPlus, MoreHorizontal, Zap, Check,
} from "lucide-react";
import { cn, formatRelativeTime, formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  mockProviderConfig, mockProviderKeys, mockMembers,
  mockPendingInvites, mockUsageStats, mockWorkspace,
} from "@/lib/mock-data";
import type { ProviderConfig, ProviderKey } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "ai-provider", label: "AI Provider" },
  { key: "members",     label: "Members"     },
  { key: "workspace",   label: "Workspace"   },
  { key: "usage",       label: "Usage"       },
] as const;

type TabKey = typeof TABS[number]["key"];

interface ProviderDef {
  key: ProviderKey;
  name: string;
  description: string;
  color: string;
  textColor: string;
  initial: string;
  requiresKey: boolean;
  requiresBaseUrl: boolean;
  requiresRegion?: boolean;
  keyPlaceholder?: string;
  keyDashboardLabel?: string;
  baseUrlPlaceholder?: string;
}

const PROVIDERS: ProviderDef[] = [
  { key: "askdocs-default", name: "AskDocs Default",  description: "Gemini Flash · no API key required",       color: "bg-indigo-500/20", textColor: "text-indigo-400",  initial: "A",  requiresKey: false, requiresBaseUrl: false },
  { key: "openai",          name: "OpenAI",            description: "GPT-4o, GPT-4-turbo, o1-preview",          color: "bg-emerald-500/20", textColor: "text-emerald-400", initial: "O",  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: "sk-…", keyDashboardLabel: "platform.openai.com/api-keys" },
  { key: "anthropic",       name: "Anthropic",         description: "Claude 4 Sonnet, Opus, Haiku",             color: "bg-orange-500/20",  textColor: "text-orange-400",  initial: "A",  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: "sk-ant-…", keyDashboardLabel: "console.anthropic.com/keys" },
  { key: "google-gemini",   name: "Google Gemini",     description: "Gemini 2.0 Flash, 1.5 Pro",                color: "bg-blue-500/20",    textColor: "text-blue-400",    initial: "G",  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: "AIza…", keyDashboardLabel: "aistudio.google.com/apikey" },
  { key: "azure-openai",    name: "Azure OpenAI",      description: "Enterprise OpenAI deployment",             color: "bg-sky-500/20",     textColor: "text-sky-400",     initial: "Az", requiresKey: true,  requiresBaseUrl: true, requiresRegion: true, keyPlaceholder: "Your Azure API key", keyDashboardLabel: "portal.azure.com", baseUrlPlaceholder: "https://your-resource.openai.azure.com" },
  { key: "mistral",         name: "Mistral",           description: "Mistral Large, Medium, Small",             color: "bg-amber-500/20",   textColor: "text-amber-400",   initial: "M",  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: "…", keyDashboardLabel: "console.mistral.ai/api-keys" },
  { key: "groq",            name: "Groq",              description: "Fast Llama, Mixtral inference",            color: "bg-rose-500/20",    textColor: "text-rose-400",    initial: "G",  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: "gsk_…", keyDashboardLabel: "console.groq.com/keys" },
  { key: "ollama",          name: "Ollama",            description: "Run any open model on your own infra",     color: "bg-violet-500/20",  textColor: "text-violet-400",  initial: "O",  requiresKey: false, requiresBaseUrl: true, baseUrlPlaceholder: "http://localhost:11434" },
];

const MODEL_SUGGESTIONS: Record<ProviderKey, string[]> = {
  "askdocs-default": ["gemini-flash"],
  openai:            ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview"],
  anthropic:         ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  "google-gemini":   ["gemini-2.0-flash", "gemini-2.0-flash-thinking", "gemini-1.5-pro"],
  "azure-openai":    ["gpt-4o", "gpt-4-turbo", "gpt-35-turbo"],
  mistral:           ["mistral-large-latest", "mistral-medium-latest"],
  groq:              ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  ollama:            ["llama3.3", "qwen2.5", "mistral"],
};

const AZURE_REGIONS = ["East US", "East US 2", "West US", "West US 2", "Sweden Central", "UK South", "West Europe"];

// ── Shared input styles ───────────────────────────────────────────────────────

const inputCls = cn(
  "w-full rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-sm text-foreground",
  "placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50",
  "focus:ring-2 focus:ring-indigo-500/10 transition-all duration-150"
);

const selectCls = cn(
  "w-full rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-sm text-foreground",
  "focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10",
  "transition-all duration-150 cursor-pointer"
);

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("ai-provider");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {mockWorkspace.name} · {mockWorkspace.plan.charAt(0).toUpperCase() + mockWorkspace.plan.slice(1)}
        </span>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-border/60 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "relative px-3 py-3 text-sm transition-colors",
              activeTab === tab.key ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-indigo-500" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "ai-provider" && <AIProviderTab />}
        {activeTab === "members"     && <MembersTab />}
        {activeTab === "workspace"   && <WorkspaceTab />}
        {activeTab === "usage"       && <UsageTab />}
      </div>
    </div>
  );
}

// ── AI Provider Tab ───────────────────────────────────────────────────────────

function AIProviderTab() {
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("anthropic");
  const [config, setConfig] = useState<ProviderConfig>({ ...mockProviderConfig });
  const [embeddingsOpen, setEmbeddingsOpen] = useState(false);
  const providerGridRef = useRef<HTMLDivElement>(null);

  const activeProviderDef = PROVIDERS.find((p) => p.key === "anthropic")!;

  const handleProviderSelect = (key: ProviderKey) => {
    setSelectedProvider(key);
    setConfig({
      provider: key,
      apiKey: "",
      baseUrl: "",
      region: AZURE_REGIONS[0],
      model: MODEL_SUGGESTIONS[key][0],
      temperature: 0.7,
      maxTokens: 2048,
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Section 1 — Active model */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Currently active</p>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold", activeProviderDef.color, activeProviderDef.textColor)}>
            {activeProviderDef.initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{activeProviderDef.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{config.model}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            Connected · Your key
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => providerGridRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            Change
          </Button>
        </div>
      </div>

      {/* Section 2 — Provider grid */}
      <div ref={providerGridRef}>
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground">Choose a provider</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your API key is encrypted at rest and never exposed to other workspace members.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p.key}
              provider={p}
              selected={selectedProvider === p.key}
              hasKey={!!mockProviderKeys[p.key]}
              onSelect={() => handleProviderSelect(p.key)}
            />
          ))}
        </div>
      </div>

      {/* Section 3 — Config form */}
      {selectedProvider !== "askdocs-default" ? (
        <ConfigForm provider={selectedProvider} config={config} onChange={setConfig} />
      ) : (
        <div className="rounded-xl border border-border bg-card/50 px-5 py-4 flex items-center gap-3">
          <Zap className="h-4 w-4 text-indigo-400 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Using AskDocs default · no configuration needed. Powered by Gemini Flash on our infrastructure.
          </p>
        </div>
      )}

      {/* Section 4 — Embeddings (informational, collapsible) */}
      <div className="rounded-xl border border-border">
        <button
          onClick={() => setEmbeddingsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="font-medium">Advanced: Embedding model</span>
          {embeddingsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {embeddingsOpen && (
          <div className="border-t border-border px-5 py-5 space-y-4">
            {/* Active embedding */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Embedding Model</p>
              <p className="font-mono text-sm text-foreground">
                sentence-transformers/all-MiniLM-L6-v2 · 384 dimensions · Local
              </p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-lg">
                Computed in-container. Document content never leaves your infrastructure.
                Switching embedding models requires re-indexing all documents.
              </p>
            </div>

            {/* Disabled secondary option */}
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3.5 opacity-50 cursor-not-allowed select-none">
              <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-border/60" />
              <div>
                <p className="text-sm text-muted-foreground">
                  OpenAI Embeddings (text-embedding-3-small)
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Contact support to enable</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider, selected, hasKey, onSelect,
}: {
  provider: ProviderDef;
  selected: boolean;
  hasKey: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative text-left rounded-xl border p-4 transition-all duration-150",
        selected
          ? "border-indigo-500/50 bg-indigo-500/5 ring-1 ring-indigo-500/20"
          : "border-border bg-card hover:border-border"
      )}
    >
      {/* Top-right indicator */}
      <div className="absolute top-3.5 right-3.5 flex items-center justify-center">
        {selected ? (
          <Check className="h-3.5 w-3.5 text-indigo-400" />
        ) : hasKey ? (
          <div className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
        ) : (
          <div className="h-2 w-2 rounded-full border border-border/60" />
        )}
      </div>

      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold mb-3", provider.color, provider.textColor)}>
        {provider.initial}
      </div>
      <p className="text-sm font-medium text-foreground">{provider.name}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{provider.description}</p>
    </button>
  );
}

// ── Model combobox ────────────────────────────────────────────────────────────

function ModelCombobox({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const query = inputValue.toLowerCase();
  const filtered = query
    ? suggestions.filter((s) => s.toLowerCase().includes(query))
    : suggestions;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onChange(e.target.value);
    setOpen(true);
  };

  const handleSelect = (model: string) => {
    setInputValue(model);
    onChange(model);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Select or type a model ID…"
        className={cn(inputCls, "font-mono")}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          {filtered.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(m)}
              className={cn(
                "flex w-full items-center px-3 py-2.5 text-left text-sm font-mono transition-colors",
                m === inputValue
                  ? "bg-indigo-500/10 text-indigo-300"
                  : "text-foreground/70 hover:bg-muted hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Config form ───────────────────────────────────────────────────────────────

type TestStatus = "idle" | "loading" | "success" | "error";

function ConfigForm({
  provider, config, onChange,
}: {
  provider: ProviderKey;
  config: ProviderConfig;
  onChange: (c: ProviderConfig) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const def = PROVIDERS.find((p) => p.key === provider)!;
  const suggestions = MODEL_SUGGESTIONS[provider];

  const handleTest = async () => {
    setTestStatus("loading");
    setTestMessage("");
    await new Promise((r) => setTimeout(r, 1500));
    setTestStatus("success");
    setTestMessage("Connected successfully");
    setTimeout(() => setTestStatus("idle"), 4000);
  };

  return (
    <div className="rounded-xl border border-border bg-card/50">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-medium text-foreground">Configuration · {def.name}</p>
      </div>
      <div className="px-5 py-5 space-y-5">
        {/* API Key */}
        {def.requiresKey && (
          <FormField label="API Key" required>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.apiKey ?? ""}
                onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
                placeholder={def.keyPlaceholder}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/70 transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {def.keyDashboardLabel && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Get your key from{" "}
                <a
                  href={`https://${def.keyDashboardLabel}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  {def.name} dashboard ↗
                </a>
              </p>
            )}
          </FormField>
        )}

        {/* Base URL */}
        {def.requiresBaseUrl && (
          <FormField
            label="Base URL"
            required={provider === "azure-openai" || provider === "ollama"}
          >
            <input
              type="url"
              value={config.baseUrl ?? ""}
              onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
              placeholder={def.baseUrlPlaceholder}
              className={inputCls}
            />
          </FormField>
        )}

        {/* Region — Azure only */}
        {def.requiresRegion && (
          <FormField label="Region" required>
            <select
              value={config.region ?? AZURE_REGIONS[0]}
              onChange={(e) => onChange({ ...config, region: e.target.value })}
              className={selectCls}
            >
              {AZURE_REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </FormField>
        )}

        {/* Model combobox */}
        <FormField label="Model">
          <ModelCombobox
            value={config.model}
            onChange={(m) => onChange({ ...config, model: m })}
            suggestions={suggestions}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Don&apos;t see your model? Type the exact model ID from the provider&apos;s docs.
          </p>
        </FormField>

        {/* Temperature */}
        <FormField
          label="Temperature"
          hint="Controls randomness. Lower = more focused, higher = more creative."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              className="flex-1 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-sm text-foreground/70 w-6 text-right shrink-0">
              {config.temperature}
            </span>
          </div>
        </FormField>

        {/* Max tokens */}
        <FormField label="Max tokens" hint="Maximum number of tokens in the model's response.">
          <input
            type="number"
            min={256}
            max={32768}
            step={256}
            value={config.maxTokens}
            onChange={(e) => onChange({ ...config, maxTokens: parseInt(e.target.value) })}
            className={cn(inputCls, "w-32")}
          />
        </FormField>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testStatus === "loading"}
            className="gap-2"
          >
            {testStatus === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Test connection
          </Button>
          <Button size="sm" onClick={() => {}}>Save configuration</Button>

          {testStatus === "success" && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {testMessage}
            </span>
          )}
          {testStatus === "error" && (
            <span className="flex items-center gap-1.5 text-sm text-rose-400 animate-fade-in">
              <XCircle className="h-4 w-4 shrink-0" />
              {testMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Workspace Tab ─────────────────────────────────────────────────────────────

function WorkspaceTab() {
  const [name, setName] = useState(mockWorkspace.name);
  const [isDefault, setIsDefault] = useState(true);

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      <Section title="Workspace" description="Basic workspace identity and preferences.">
        <FormField label="Workspace name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="Workspace slug" hint="Used in URLs and API references. Cannot be changed.">
          <input
            readOnly
            value={mockWorkspace.slug}
            className={cn(inputCls, "font-mono text-muted-foreground bg-muted/40 cursor-not-allowed")}
          />
        </FormField>
        <FormField label="Logo">
          <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-border bg-card/50 text-xs text-muted-foreground cursor-pointer hover:border-border/60 transition-colors">
            Drop an image or click to upload · PNG, SVG · max 512 KB
          </div>
        </FormField>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Default workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">Open this workspace when you sign in</p>
          </div>
          <Toggle checked={isDefault} onChange={setIsDefault} />
        </div>
        <Button size="sm">Save changes</Button>
      </Section>

      <div className="border-t border-border" />

      <Section title="Danger zone" description="Irreversible actions. Proceed with caution.">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently deletes all documents, conversations, and member access. This cannot be undone.
            </p>
          </div>
          <Button variant="destructive" size="sm" className="shrink-0">Delete workspace</Button>
        </div>
      </Section>
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{mockMembers.length} members</p>
          <p className="text-xs text-muted-foreground mt-0.5">{mockWorkspace.name}</p>
        </div>
        <Button size="sm" className="gap-2">
          <UserPlus className="h-3.5 w-3.5" />
          Invite member
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div
          className="grid items-center gap-4 px-4 py-2.5 bg-card/60 border-b border-border"
          style={{ gridTemplateColumns: "1fr 1fr 120px 120px 120px 40px" }}
        >
          {["Member", "Email", "Role", "Joined", "Last active", ""].map((col, i) => (
            <span key={i} className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{col}</span>
          ))}
        </div>
        {mockMembers.map((m, i) => (
          <div
            key={m.id}
            className={cn(
              "group grid items-center gap-4 px-4 py-3",
              i < mockMembers.length - 1 && "border-b border-border/50"
            )}
            style={{ gridTemplateColumns: "1fr 1fr 120px 120px 120px 40px" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[10px] bg-muted text-foreground/70">{m.user.avatarInitials}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-foreground truncate">{m.user.name}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground truncate">{m.user.email}</span>
            <RoleBadge role={m.role} />
            <span className="text-xs text-muted-foreground">
              {m.joinedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
            </span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(m.lastActiveAt)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem>Change role</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10">Remove</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Pending invites */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Pending invites</p>
        <div className="rounded-xl border border-border overflow-hidden">
          {mockPendingInvites.map((inv, i) => (
            <div
              key={inv.id}
              className={cn(
                "flex items-center justify-between px-4 py-3 gap-4",
                i < mockPendingInvites.length - 1 && "border-b border-border/50"
              )}
            >
              <div>
                <span className="font-mono text-sm text-muted-foreground italic">{inv.email}</span>
                <span className="ml-3 text-xs text-muted-foreground/60">{formatRelativeTime(inv.invitedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <RoleBadge role={inv.role} />
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2.5">Resend</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2.5 text-muted-foreground">Cancel</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Usage Tab ─────────────────────────────────────────────────────────────────

function UsageTab() {
  const stats = mockUsageStats;
  const queryPct = (stats.queriesThisMonth / stats.queriesLimit) * 100;
  const storagePct = (stats.storageUsedBytes / stats.storageLimitBytes) * 100;
  const maxDaily = Math.max(...stats.dailyQueries.map((d) => d.count));
  const totalQueries = stats.topUsers.reduce((s, u) => s + u.queries, 0);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Queries this month" value={stats.queriesThisMonth.toLocaleString()} sub={`of ${stats.queriesLimit.toLocaleString()} limit`} pct={queryPct} />
        <StatCard label="Documents stored" value={stats.documentsCount.toString()} />
        <StatCard label="Storage used" value={formatFileSize(stats.storageUsedBytes)} sub={`of ${formatFileSize(stats.storageLimitBytes)}`} pct={storagePct} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-foreground">Daily queries</p>
          <p className="text-xs text-muted-foreground">Last 30 days</p>
        </div>
        <svg viewBox={`0 0 ${stats.dailyQueries.length * 10} 80`} className="w-full h-20" preserveAspectRatio="none">
          {stats.dailyQueries.map((d, i) => {
            const h = Math.max(2, (d.count / maxDaily) * 72);
            return <rect key={i} x={i * 10} y={80 - h} width={8} height={h} fill="#6366f1" opacity={0.55} rx={1.5} />;
          })}
        </svg>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-muted-foreground/60">{stats.dailyQueries[0].date}</span>
          <span className="text-[10px] text-muted-foreground/60">{stats.dailyQueries[stats.dailyQueries.length - 1].date}</span>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-3">Top users · this month</p>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid gap-4 px-4 py-2.5 bg-card/60 border-b border-border"
            style={{ gridTemplateColumns: "1fr 100px 80px" }}>
            {["Member", "Queries", "% of total"].map((col, i) => (
              <span key={i} className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{col}</span>
            ))}
          </div>
          {stats.topUsers.map((u, i) => (
            <div
              key={i}
              className={cn("grid items-center gap-4 px-4 py-3", i < stats.topUsers.length - 1 && "border-b border-border/50")}
              style={{ gridTemplateColumns: "1fr 100px 80px" }}
            >
              <div className="flex items-center gap-2.5">
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarFallback className="text-[9px] bg-muted text-foreground/70">{u.user.avatarInitials}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-foreground">{u.user.name}</span>
              </div>
              <span className="text-sm text-foreground/70">{u.queries.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">{((u.queries / totalQueries) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 rounded-full transition-colors duration-200", checked ? "bg-indigo-500" : "bg-muted")}
    >
      <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", checked && "translate-x-4")} />
    </button>
  );
}

function RoleBadge({ role }: { role: "admin" | "member" | "viewer" }) {
  const styles = { admin: "bg-indigo-500/15 text-indigo-400", member: "bg-muted text-muted-foreground", viewer: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", styles[role])}>{role}</span>;
}

function StatCard({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {pct !== undefined && (
        <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pct > 85 ? "bg-rose-500" : "bg-indigo-500")}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}
