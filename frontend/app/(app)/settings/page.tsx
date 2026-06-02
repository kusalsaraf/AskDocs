'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronRight,
  Loader2, UserPlus, MoreHorizontal, Zap, Check,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import {
  useProvider, useSupportedProviders, useSaveProvider,
  useTestProvider,
} from '@/lib/hooks/useProviders'
import { listMembers, listInvitations, inviteMember, removeMember } from '@/lib/api/workspaces'
import { updateWorkspace } from '@/lib/api/workspaces'
import { getQuota } from '@/lib/api/chat'
import { adaptMember, adaptInvitation, adaptProviderConfig } from '@/lib/types/domain'
import type { ProviderConfig, ProviderKey } from '@/lib/types/domain'
import type { ApiProviderConfig } from '@/lib/types/api'

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'ai-provider', label: 'AI Provider' },
  { key: 'members',     label: 'Members'     },
  { key: 'workspace',   label: 'Workspace'   },
  { key: 'usage',       label: 'Usage'       },
] as const

type TabKey = (typeof TABS)[number]['key']

interface ProviderDef {
  key: ProviderKey
  name: string
  description: string
  color: string
  textColor: string
  initial: string
  requiresKey: boolean
  requiresBaseUrl: boolean
  requiresRegion?: boolean
  keyPlaceholder?: string
  keyDashboardLabel?: string
  baseUrlPlaceholder?: string
}

const PROVIDERS: ProviderDef[] = [
  { key: 'askdocs-default', name: 'AskDocs Default',  description: 'Gemini Flash · no API key required',   color: 'bg-indigo-500/20',  textColor: 'text-indigo-400',  initial: 'A',  requiresKey: false, requiresBaseUrl: false },
  { key: 'openai',          name: 'OpenAI',            description: 'GPT-4o, GPT-4-turbo, o1-preview',      color: 'bg-emerald-500/20', textColor: 'text-emerald-400', initial: 'O',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'sk-…', keyDashboardLabel: 'platform.openai.com/api-keys' },
  { key: 'anthropic',       name: 'Anthropic',         description: 'Claude 4 Sonnet, Opus, Haiku',         color: 'bg-orange-500/20',  textColor: 'text-orange-400',  initial: 'A',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'sk-ant-…', keyDashboardLabel: 'console.anthropic.com/keys' },
  { key: 'google-gemini',   name: 'Google Gemini',     description: 'Gemini 2.0 Flash, 1.5 Pro',            color: 'bg-blue-500/20',    textColor: 'text-blue-400',    initial: 'G',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'AIza…', keyDashboardLabel: 'aistudio.google.com/apikey' },
  { key: 'azure-openai',    name: 'Azure OpenAI',      description: 'Enterprise OpenAI deployment',         color: 'bg-sky-500/20',     textColor: 'text-sky-400',     initial: 'Az', requiresKey: true,  requiresBaseUrl: true, requiresRegion: true, keyPlaceholder: 'Your Azure API key', keyDashboardLabel: 'portal.azure.com', baseUrlPlaceholder: 'https://your-resource.openai.azure.com' },
  { key: 'mistral',         name: 'Mistral',           description: 'Mistral Large, Medium, Small',         color: 'bg-amber-500/20',   textColor: 'text-amber-400',   initial: 'M',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: '…', keyDashboardLabel: 'console.mistral.ai/api-keys' },
  { key: 'groq',            name: 'Groq',              description: 'Fast Llama, Mixtral inference',        color: 'bg-rose-500/20',    textColor: 'text-rose-400',    initial: 'G',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'gsk_…', keyDashboardLabel: 'console.groq.com/keys' },
  { key: 'ollama',          name: 'Ollama',            description: 'Run any open model on your own infra', color: 'bg-violet-500/20',  textColor: 'text-violet-400',  initial: 'O',  requiresKey: false, requiresBaseUrl: true, baseUrlPlaceholder: 'http://localhost:11434' },
]

const AZURE_REGIONS = ['East US', 'East US 2', 'West US', 'West US 2', 'Sweden Central', 'UK South', 'West Europe']

const inputCls = cn(
  'w-full rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-sm text-foreground',
  'placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50',
  'focus:ring-2 focus:ring-indigo-500/10 transition-all duration-150'
)

const selectCls = cn(
  'w-full rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-sm text-foreground',
  'focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10',
  'transition-all duration-150 cursor-pointer'
)

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('ai-provider')
  const { activeWorkspace } = useWorkspace()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {activeWorkspace?.name ?? ''}
        </span>
      </div>

      <div className="flex items-center gap-1 border-b border-border/60 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative px-3 py-3 text-sm transition-colors',
              activeTab === tab.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-indigo-500" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'ai-provider' && <AIProviderTab />}
        {activeTab === 'members'     && <MembersTab />}
        {activeTab === 'workspace'   && <WorkspaceTab />}
        {activeTab === 'usage'       && <UsageTab />}
      </div>
    </div>
  )
}

// ── AI Provider Tab ───────────────────────────────────────────────────────────

function AIProviderTab() {
  const { activeWorkspace } = useWorkspace()
  const { data: providerData, isLoading } = useProvider(activeWorkspace?.id)
  const { data: supported = [] } = useSupportedProviders()
  const { mutateAsync: doSave, isPending: isSaving } = useSaveProvider(activeWorkspace?.id)
  const { mutateAsync: doTest } = useTestProvider(activeWorkspace?.id)

  const usingDefault  = !providerData || 'using_platform_default' in providerData
  const activeConfig  = usingDefault ? null : (providerData as ApiProviderConfig)
  const supportedMap  = new Map(supported.map((p) => [p.name, p]))
  const providerGridRef = useRef<HTMLDivElement>(null)

  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('askdocs-default')
  const [config, setConfig] = useState<ProviderConfig>({
    provider: 'askdocs-default', model: '', temperature: 0.7, maxTokens: 2048,
  })
  const [testStatus, setTestStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [embeddingsOpen, setEmbeddingsOpen] = useState(false)

  // Seed form from live provider config
  useEffect(() => {
    if (activeConfig) {
      setSelectedProvider(activeConfig.provider_name as ProviderKey)
      setConfig(adaptProviderConfig(activeConfig))
    }
  }, [activeConfig?.provider_name]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderSelect = (key: ProviderKey) => {
    const sup = supportedMap.get(key)
    setSelectedProvider(key)
    setConfig({
      provider: key, apiKey: '', baseUrl: '', region: AZURE_REGIONS[0],
      model: sup?.default_model ?? '', temperature: 0.7, maxTokens: 2048,
    })
    setTestStatus('idle')
    setTestMessage('')
  }

  const handleTest = async () => {
    setTestStatus('loading')
    setTestMessage('')
    try {
      const result = await doTest()
      if (result.success) {
        setTestStatus('success')
        setTestMessage(`Connected · ${result.latency_ms}ms`)
      } else {
        setTestStatus('error')
        setTestMessage(result.error ?? 'Connection failed')
      }
    } catch {
      setTestStatus('error')
      setTestMessage('Request failed')
    }
  }

  const handleSave = async () => {
    await doSave({
      provider_name: config.provider,
      api_key:       config.apiKey,
      model_name:    config.model,
      temperature:   config.temperature,
      max_tokens:    config.maxTokens,
      base_url:      config.baseUrl || undefined,
      azure_region:  config.region  || undefined,
    })
  }

  const activeProviderDef =
    PROVIDERS.find((p) => p.key === (usingDefault ? 'askdocs-default' : activeConfig?.provider_name)) ??
    PROVIDERS[0]

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Currently active */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Currently active</p>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold', activeProviderDef.color, activeProviderDef.textColor)}>
            {activeProviderDef.initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{activeProviderDef.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
              {usingDefault ? 'gemini-flash' : activeConfig?.model_name}
            </p>
          </div>
          <span className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
            usingDefault
              ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
              : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
          )}>
            <CheckCircle2 className="h-3 w-3" />
            {usingDefault ? 'Platform default' : 'Your key'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => providerGridRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            Change
          </Button>
        </div>
      </div>

      {/* Provider grid */}
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
              hasKey={!usingDefault && activeConfig?.provider_name === p.key}
              onSelect={() => handleProviderSelect(p.key)}
            />
          ))}
        </div>
      </div>

      {/* Config form */}
      {selectedProvider !== 'askdocs-default' ? (
        <ConfigForm
          provider={selectedProvider}
          config={config}
          onChange={setConfig}
          testStatus={testStatus}
          testMessage={testMessage}
          isSaving={isSaving}
          onTest={handleTest}
          onSave={handleSave}
          supportedModels={supportedMap.get(selectedProvider)?.available_models ?? []}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card/50 px-5 py-4 flex items-center gap-3">
          <Zap className="h-4 w-4 text-indigo-400 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Using AskDocs default · no configuration needed. Powered by Gemini Flash on our infrastructure.
          </p>
        </div>
      )}

      {/* Embeddings (informational) */}
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
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Embedding Model</p>
              <p className="font-mono text-sm text-foreground">text-embedding-3-small · 768 dimensions</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-lg">
                Switching embedding models requires re-indexing all documents.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProviderCard({
  provider, selected, hasKey, onSelect,
}: {
  provider: ProviderDef; selected: boolean; hasKey: boolean; onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative text-left rounded-xl border p-4 transition-all duration-150',
        selected
          ? 'border-indigo-500/50 bg-indigo-500/5 ring-1 ring-indigo-500/20'
          : 'border-border bg-card hover:border-border'
      )}
    >
      <div className="absolute top-3.5 right-3.5 flex items-center justify-center">
        {selected ? (
          <Check className="h-3.5 w-3.5 text-indigo-400" />
        ) : hasKey ? (
          <div className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
        ) : (
          <div className="h-2 w-2 rounded-full border border-border/60" />
        )}
      </div>
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold mb-3', provider.color, provider.textColor)}>
        {provider.initial}
      </div>
      <p className="text-sm font-medium text-foreground">{provider.name}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{provider.description}</p>
    </button>
  )
}

function ModelCombobox({
  value, onChange, suggestions,
}: {
  value: string; onChange: (v: string) => void; suggestions: string[]
}) {
  const [open, setOpen]             = useState(false)
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => { setInputValue(value) }, [value])

  const query    = inputValue.toLowerCase()
  const filtered = query ? suggestions.filter((s) => s.toLowerCase().includes(query)) : suggestions

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Select or type a model ID…"
        className={cn(inputCls, 'font-mono')}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          {filtered.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setInputValue(m); onChange(m); setOpen(false) }}
              className={cn(
                'flex w-full items-center px-3 py-2.5 text-left text-sm font-mono transition-colors',
                m === inputValue
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfigForm({
  provider, config, onChange, testStatus, testMessage, isSaving, onTest, onSave, supportedModels,
}: {
  provider: ProviderKey
  config: ProviderConfig
  onChange: (c: ProviderConfig) => void
  testStatus: 'idle' | 'loading' | 'success' | 'error'
  testMessage: string
  isSaving: boolean
  onTest: () => void
  onSave: () => void
  supportedModels: string[]
}) {
  const [showKey, setShowKey] = useState(false)
  const def = PROVIDERS.find((p) => p.key === provider)!

  return (
    <div className="rounded-xl border border-border bg-card/50">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-medium text-foreground">Configuration · {def.name}</p>
      </div>
      <div className="px-5 py-5 space-y-5">
        {def.requiresKey && (
          <FormField label="API Key" required>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey ?? ''}
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
                Get your key from{' '}
                <a href={`https://${def.keyDashboardLabel}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">
                  {def.name} dashboard ↗
                </a>
              </p>
            )}
          </FormField>
        )}

        {def.requiresBaseUrl && (
          <FormField label="Base URL" required={provider === 'azure-openai' || provider === 'ollama'}>
            <input
              type="url"
              value={config.baseUrl ?? ''}
              onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
              placeholder={def.baseUrlPlaceholder}
              className={inputCls}
            />
          </FormField>
        )}

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

        <FormField label="Model">
          <ModelCombobox
            value={config.model}
            onChange={(m) => onChange({ ...config, model: m })}
            suggestions={supportedModels}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Don&apos;t see your model? Type the exact model ID from the provider&apos;s docs.
          </p>
        </FormField>

        <FormField label="Temperature" hint="Controls randomness. Lower = more focused, higher = more creative.">
          <div className="flex items-center gap-3">
            <input
              type="range" min="0" max="1" step="0.1"
              value={config.temperature}
              onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              className="flex-1 accent-indigo-500 cursor-pointer"
            />
            <span className="font-mono text-sm text-foreground/70 w-6 text-right shrink-0">
              {config.temperature}
            </span>
          </div>
        </FormField>

        <FormField label="Max tokens" hint="Maximum number of tokens in the model's response.">
          <input
            type="number" min={256} max={32768} step={256}
            value={config.maxTokens}
            onChange={(e) => onChange({ ...config, maxTokens: parseInt(e.target.value) })}
            className={cn(inputCls, 'w-32')}
          />
        </FormField>

        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline" size="sm"
            onClick={onTest}
            disabled={testStatus === 'loading'}
            className="gap-2"
          >
            {testStatus === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Test connection
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save configuration
          </Button>

          {testStatus === 'success' && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {testMessage}
            </span>
          )}
          {testStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-rose-400">
              <XCircle className="h-4 w-4 shrink-0" />
              {testMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Workspace Tab ─────────────────────────────────────────────────────────────

function WorkspaceTab() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const { mutate: doUpdate, isPending } = useMutation({
    mutationFn: (name: string) => updateWorkspace(activeWorkspace!.id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
  const [name, setName] = useState(activeWorkspace?.name ?? '')
  useEffect(() => { setName(activeWorkspace?.name ?? '') }, [activeWorkspace?.name])

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      <Section title="Workspace" description="Basic workspace identity and preferences.">
        <FormField label="Workspace name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="Workspace slug" hint="Used in URLs and API references. Cannot be changed.">
          <input
            readOnly value={activeWorkspace?.slug ?? ''}
            className={cn(inputCls, 'font-mono text-muted-foreground bg-muted/40 cursor-not-allowed')}
          />
        </FormField>
        <Button size="sm" disabled={isPending} onClick={() => doUpdate(name)}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </Section>
    </div>
  )
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [showInvite, setShowInvite]   = useState(false)

  const { data: rawMembers = [], isLoading } = useQuery({
    queryKey: ['members', activeWorkspace?.id],
    queryFn:  () => listMembers(activeWorkspace!.id),
    enabled:  !!activeWorkspace,
  })
  const { data: rawInvites = [] } = useQuery({
    queryKey: ['invitations', activeWorkspace?.id],
    queryFn:  () => listInvitations(activeWorkspace!.id),
    enabled:  !!activeWorkspace,
  })

  const members = rawMembers.map(adaptMember)
  const invites = rawInvites.map(adaptInvitation)

  const { mutate: doRemove } = useMutation({
    mutationFn: (userId: string) => removeMember(activeWorkspace!.id, userId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['members', activeWorkspace?.id] }),
  })
  const { mutate: doInvite, isPending: isInviting } = useMutation({
    mutationFn: () => inviteMember(activeWorkspace!.id, inviteEmail, 'member'),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', activeWorkspace?.id] })
      setInviteEmail('')
      setShowInvite(false)
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{members.length} members</p>
          <p className="text-xs text-muted-foreground mt-0.5">{activeWorkspace?.name}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowInvite(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          Invite member
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-xl border border-border bg-card/50 px-5 py-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Invite by email</p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && inviteEmail) doInvite() }}
              placeholder="colleague@company.com"
              className={cn(inputCls, 'flex-1')}
            />
            <Button size="sm" disabled={!inviteEmail || isInviting} onClick={() => doInvite()}>
              {isInviting ? 'Sending…' : 'Send invite'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div
          className="grid items-center gap-4 px-4 py-2.5 bg-card/60 border-b border-border"
          style={{ gridTemplateColumns: '1fr 1fr 120px 120px 40px' }}
        >
          {['Member', 'Email', 'Role', 'Joined', ''].map((col, i) => (
            <span key={i} className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {col}
            </span>
          ))}
        </div>
        {members.map((m, i) => (
          <div
            key={m.id}
            className={cn('group grid items-center gap-4 px-4 py-3', i < members.length - 1 && 'border-b border-border/50')}
            style={{ gridTemplateColumns: '1fr 1fr 120px 120px 40px' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[10px] bg-muted text-foreground/70">
                  {m.user.avatarInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-foreground truncate">{m.user.name}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground truncate">{m.user.email}</span>
            <RoleBadge role={m.role} />
            <span className="text-xs text-muted-foreground">
              {m.joinedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
                  onClick={() => doRemove(m.id)}
                >
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Pending invites
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            {invites.map((inv, i) => (
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
                <RoleBadge role={inv.role} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Usage Tab ─────────────────────────────────────────────────────────────────

function UsageTab() {
  const { activeWorkspace } = useWorkspace()
  const { data: quota, isLoading } = useQuery({
    queryKey: ['quota', activeWorkspace?.id],
    queryFn:  () => getQuota(activeWorkspace!.id),
    enabled:  !!activeWorkspace,
  })

  if (isLoading || !quota) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const queryPct = (quota.user_used / quota.user_limit) * 100

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Messages used"
          value={quota.user_used.toLocaleString()}
          sub={`of ${quota.user_limit.toLocaleString()} daily limit`}
          pct={queryPct}
        />
        <StatCard
          label="Remaining today"
          value={quota.user_remaining.toLocaleString()}
        />
        <StatCard
          label="Usage"
          value={`${Math.round(queryPct)}%`}
          pct={queryPct}
        />
      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function RoleBadge({ role }: { role: 'admin' | 'member' | 'viewer' }) {
  const styles = {
    admin: 'bg-indigo-500/15 text-indigo-400',
    member: 'bg-muted text-muted-foreground',
    viewer: 'bg-muted text-muted-foreground',
  }
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', styles[role])}>
      {role}
    </span>
  )
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
            className={cn('h-full rounded-full transition-all', pct > 85 ? 'bg-rose-500' : 'bg-indigo-500')}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  )
}
