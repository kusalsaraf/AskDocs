'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronRight,
  Loader2, UserPlus, MoreHorizontal, Zap, Check, Copy, RotateCcw,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import {
  useProvider, useSupportedProviders, useSaveProvider,
  useDeleteProvider, useTestProvider,
} from '@/lib/hooks/useProviders'
import { listMembers, listInvitations, inviteMember, removeMember, resendInvitation } from '@/lib/api/workspaces'
import { updateWorkspace } from '@/lib/api/workspaces'
import { getQuota } from '@/lib/api/chat'
import { testDefaultProvider } from '@/lib/api/providers'
import { adaptMember, adaptInvitation, adaptProviderConfig, backendToProviderKey, providerKeyToBackend } from '@/lib/types/domain'
import type { ProviderConfig, ProviderKey } from '@/lib/types/domain'
import type { ApiProviderConfig } from '@/lib/types/api'
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  EMBEDDING_DIMENSIONS,
  COPY_FEEDBACK_MS,
  SAVE_FEEDBACK_MS,
  USAGE_WARNING_THRESHOLD,
  queryKeys,
} from '@/lib/constants'

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { key: 'ai-provider', label: 'AI Provider', adminOnly: true  },
  { key: 'members',     label: 'Members',     adminOnly: false },
  { key: 'workspace',   label: 'Workspace',   adminOnly: true  },
  { key: 'usage',       label: 'Usage',       adminOnly: false },
] as const

type TabKey = (typeof ALL_TABS)[number]['key']

interface ProviderDef {
  key: ProviderKey
  name: string
  description: string
  color: string
  textColor: string
  initial: string
  requiresKey: boolean
  requiresBaseUrl: boolean
  keyPlaceholder?: string
  keyDashboardLabel?: string
  baseUrlPlaceholder?: string
}

const PROVIDERS: ProviderDef[] = [
  { key: 'askdocs-default', name: 'AskDocs Default',  description: 'Gemini Flash · no API key required',   color: 'bg-indigo-500/20',  textColor: 'text-indigo-400',  initial: 'A',  requiresKey: false, requiresBaseUrl: false },
  { key: 'openai',          name: 'OpenAI',            description: 'GPT-4o, GPT-4-turbo, o1-preview',      color: 'bg-emerald-500/20', textColor: 'text-emerald-400', initial: 'O',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'sk-…', keyDashboardLabel: 'platform.openai.com/api-keys' },
  { key: 'anthropic',       name: 'Anthropic',         description: 'Claude 4 Sonnet, Opus, Haiku',         color: 'bg-orange-500/20',  textColor: 'text-orange-400',  initial: 'A',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'sk-ant-…', keyDashboardLabel: 'console.anthropic.com/keys' },
  { key: 'google-gemini',   name: 'Google Gemini',     description: 'Gemini 2.0 Flash, 1.5 Pro',            color: 'bg-blue-500/20',    textColor: 'text-blue-400',    initial: 'G',  requiresKey: true,  requiresBaseUrl: false, keyPlaceholder: 'AIza…', keyDashboardLabel: 'aistudio.google.com/apikey' },
]

const inputCls = cn(
  'w-full rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-sm text-foreground',
  'placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50',
  'focus:ring-2 focus:ring-indigo-500/10 transition-all duration-150'
)

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { activeWorkspace } = useWorkspace()
  const isAdmin = activeWorkspace?.role === 'admin'

  const visibleTabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin)
  const defaultTab = isAdmin ? 'ai-provider' : 'members'

  const getTabFromHash = (): TabKey => {
    if (typeof window === 'undefined') return defaultTab
    const hash = window.location.hash.replace('#', '') as TabKey
    return visibleTabs.some((t) => t.key === hash) ? hash : defaultTab
  }

  const [activeTab, setActiveTab] = useState<TabKey>(getTabFromHash)

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key)
    window.history.replaceState(null, '', `#${key}`)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {activeWorkspace?.name ?? ''}
        </span>
      </div>

      <div className="flex items-center gap-1 border-b border-border/60 px-6">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
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
  const { mutateAsync: doDelete, isPending: isDeleting } = useDeleteProvider(activeWorkspace?.id)
  const { mutateAsync: doTest } = useTestProvider(activeWorkspace?.id)

  const usingDefault  = !providerData || 'using_platform_default' in providerData
  const activeConfig  = usingDefault ? null : (providerData as ApiProviderConfig)
  const supportedMap  = new Map(supported.map((p) => [p.name, p]))
  const providerGridRef = useRef<HTMLDivElement>(null)

  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('askdocs-default')
  const [config, setConfig] = useState<ProviderConfig>({
    provider: 'askdocs-default', model: '', temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS,
  })
  const [testStatus, setTestStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [embeddingsOpen, setEmbeddingsOpen] = useState(false)

  const [defaultTestStatus, setDefaultTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [defaultTestMessage, setDefaultTestMessage] = useState('')

  // Seed form from live provider config
  useEffect(() => {
    if (activeConfig) {
      setSelectedProvider(backendToProviderKey(activeConfig.provider_name))
      setConfig(adaptProviderConfig(activeConfig))
      if (activeConfig.last_test_status === 'ok') {
        setTestStatus('success')
        setTestMessage('Previously verified')
      } else {
        setTestStatus('idle')
        setTestMessage('')
      }
    }
  }, [activeConfig?.provider_name]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderSelect = (key: ProviderKey) => {
    const sup = supportedMap.get(providerKeyToBackend(key))
    setSelectedProvider(key)
    setConfig({
      provider: key, apiKey: '', baseUrl: '',
      model: sup?.default_model ?? '', temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS,
    })
    setTestStatus('idle')
    setTestMessage('')
    setDefaultTestStatus('idle')
    setDefaultTestMessage('')
  }

  const handleTestDefault = async () => {
    if (!activeWorkspace?.id) return
    setDefaultTestStatus('loading')
    setDefaultTestMessage('')
    try {
      const result = await testDefaultProvider(activeWorkspace.id)
      if (result.success) {
        setDefaultTestStatus('success')
        setDefaultTestMessage(`Connected · ${result.latency_ms}ms`)
      } else {
        setDefaultTestStatus('error')
        setDefaultTestMessage(result.error ?? 'Connection failed')
      }
    } catch {
      setDefaultTestStatus('error')
      setDefaultTestMessage('Request failed')
    }
  }

  const handleSwitchToDefault = async () => {
    await doDelete()
    setDefaultTestStatus('idle')
    setDefaultTestMessage('')
  }

  const handleConfigChange = (newConfig: ProviderConfig) => {
    if (newConfig.apiKey !== config.apiKey) {
      setTestStatus('idle')
      setTestMessage('')
    }
    setConfig(newConfig)
  }

  const handleTest = async () => {
    setTestStatus('loading')
    setTestMessage('')
    try {
      const result = await doTest({
        provider_name: providerKeyToBackend(config.provider),
        api_key:       config.apiKey,
        model_name:    config.model,
        temperature:   config.temperature,
        max_tokens:    config.maxTokens,
        base_url:      config.baseUrl || undefined,
      })
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
      provider_name: providerKeyToBackend(config.provider),
      api_key:       config.apiKey,
      model_name:    config.model,
      temperature:   config.temperature,
      max_tokens:    config.maxTokens,
      base_url:      config.baseUrl || undefined,
    })
  }

  const activeProviderDef =
    PROVIDERS.find((p) => p.key === (usingDefault ? 'askdocs-default' : backendToProviderKey(activeConfig?.provider_name ?? ''))) ??
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
              hasKey={!usingDefault && backendToProviderKey(activeConfig?.provider_name ?? '') === p.key}
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
          onChange={handleConfigChange}
          testStatus={testStatus}
          testMessage={testMessage}
          isSaving={isSaving}
          onTest={handleTest}
          onSave={handleSave}
          supportedModels={supportedMap.get(providerKeyToBackend(selectedProvider))?.available_models ?? []}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card/50 px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <Zap className="h-4 w-4 text-indigo-400 shrink-0" />
            <p className="text-sm text-muted-foreground">
              No API key required. Powered by Gemini Flash on our infrastructure.
            </p>
          </div>
          {!usingDefault && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline" size="sm"
                  onClick={handleTestDefault}
                  disabled={defaultTestStatus === 'loading'}
                  className="gap-2"
                >
                  {defaultTestStatus === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Test connection
                </Button>
                <Button
                  size="sm"
                  onClick={handleSwitchToDefault}
                  disabled={isDeleting || defaultTestStatus !== 'success'}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
                  title={defaultTestStatus !== 'success' ? 'Test the connection first' : undefined}
                >
                  {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Switch to default
                </Button>

                {defaultTestStatus === 'success' && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {defaultTestMessage}
                  </span>
                )}
                {defaultTestStatus === 'error' && (
                  <span className="flex items-center gap-1.5 text-sm text-red-400">
                    <XCircle className="h-3.5 w-3.5" /> {defaultTestMessage}
                  </span>
                )}
              </div>
            </div>
          )}
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
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Active Model</p>
                <p className="font-mono text-sm text-foreground">OpenAI text-embedding-3-small · {EMBEDDING_DIMENSIONS} dims</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Alternative</p>
                <p className="font-mono text-sm text-muted-foreground">Google text-embedding-004 · {EMBEDDING_DIMENSIONS} dims</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                Configured via <span className="font-mono">EMBEDDING_PROVIDER</span> env variable. Changing models requires re-indexing all documents.
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
          <FormField label="Base URL" required>
            <input
              type="url"
              value={config.baseUrl ?? ''}
              onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
              placeholder={def.baseUrlPlaceholder}
              className={inputCls}
            />
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
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving || testStatus !== 'success'}
            className="gap-2"
            title={testStatus !== 'success' ? 'Test the connection first' : undefined}
          >
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
  const [saved, setSaved] = useState(false)
  const { mutate: doUpdate, isPending } = useMutation({
    mutationFn: (name: string) => updateWorkspace(activeWorkspace!.id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me() })
      setSaved(true)
      setTimeout(() => setSaved(false), SAVE_FEEDBACK_MS)
    },
  })
  const [name, setName] = useState(activeWorkspace?.name ?? '')
  useEffect(() => { setName(activeWorkspace?.name ?? '') }, [activeWorkspace?.name])

  const hasChanged = name.trim() !== (activeWorkspace?.name ?? '') && name.trim().length > 0

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      <Section title="Workspace" description="Basic workspace identity and preferences.">
        <FormField label="Workspace name">
          <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} className={inputCls} />
        </FormField>
        <FormField label="Workspace slug" hint="Used in URLs and API references. Cannot be changed.">
          <input
            readOnly value={activeWorkspace?.slug ?? ''}
            className={cn(inputCls, 'font-mono text-muted-foreground bg-muted/40 cursor-not-allowed')}
          />
        </FormField>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!hasChanged || isPending} onClick={() => doUpdate(name.trim())}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Workspace updated
            </span>
          )}
        </div>
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
    queryKey: queryKeys.members(activeWorkspace?.id),
    queryFn:  () => listMembers(activeWorkspace!.id),
    enabled:  !!activeWorkspace,
    staleTime: 0,
    refetchInterval: 10_000,
  })
  const isAdmin = activeWorkspace?.role === 'admin'

  const { data: rawInvites = [] } = useQuery({
    queryKey: queryKeys.invitations(activeWorkspace?.id),
    queryFn:  () => listInvitations(activeWorkspace!.id),
    enabled:  !!activeWorkspace && isAdmin,
    staleTime: 0,
    refetchInterval: 5_000,
  })

  const members = rawMembers.map(adaptMember)
  const invites = rawInvites.map(adaptInvitation)

  const { mutate: doRemove } = useMutation({
    mutationFn: (userId: string) => removeMember(activeWorkspace!.id, userId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: queryKeys.members(activeWorkspace?.id) }),
  })
  const { mutate: doInvite, isPending: isInviting } = useMutation({
    mutationFn: () => inviteMember(activeWorkspace!.id, inviteEmail, 'member'),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(activeWorkspace?.id) })
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
        {isAdmin && (
          <Button size="sm" className="gap-2" onClick={() => setShowInvite(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Invite member
          </Button>
        )}
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
            {isAdmin && m.role !== 'admin' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
                    onClick={() => doRemove(m.id)}
                  >
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
                <div className="min-w-0">
                  <span className="font-mono text-sm text-muted-foreground italic">{inv.email}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {inv.expiresAt < new Date() ? (
                      <span className="text-[11px] text-rose-400">Expired</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60">
                        Expires {formatRelativeTime(inv.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <RoleBadge role={inv.role} />
                  <ResendButton workspaceId={activeWorkspace!.id} invitationId={inv.id} />
                  <CopyLinkButton token={inv.token} />
                </div>
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
  const isAdmin = activeWorkspace?.role === 'admin'
  const { data: quota, isLoading } = useQuery({
    queryKey: queryKeys.quota(activeWorkspace?.id),
    queryFn:  () => getQuota(activeWorkspace!.id),
    enabled:  !!activeWorkspace,
    staleTime: 0,
    refetchInterval: 15_000,
  })

  if (isLoading || !quota) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const used      = quota.user_messages_used_today
  const limit     = quota.user_messages_limit
  const remaining = Math.max(0, limit - used)
  const queryPct  = limit > 0 ? (used / limit) * 100 : 0
  const wsUsage   = quota.workspace_usage

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Your usage today</p>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Messages used"
            value={used.toLocaleString()}
            sub={`of ${limit.toLocaleString()} daily limit`}
            pct={queryPct}
          />
          <StatCard
            label="Remaining today"
            value={remaining.toLocaleString()}
          />
          <StatCard
            label="Usage"
            value={`${Math.round(queryPct)}%`}
            pct={queryPct}
          />
        </div>
      </div>

      {isAdmin && wsUsage && (
        <>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Workspace total today</p>
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Total messages"
                value={wsUsage.total_messages.toLocaleString()}
                sub="all members combined"
              />
              <StatCard
                label="Active members"
                value={wsUsage.members.length.toLocaleString()}
                sub="sent messages today"
              />
              <StatCard
                label="Avg per member"
                value={wsUsage.members.length > 0 ? Math.round(wsUsage.total_messages / wsUsage.members.length).toLocaleString() : '0'}
                sub="messages today"
              />
            </div>
          </div>

          {wsUsage.members.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Per-member breakdown</p>
              <div className="rounded-xl border border-border overflow-hidden">
                <div
                  className="grid items-center gap-4 px-4 py-2.5 bg-card/60 border-b border-border"
                  style={{ gridTemplateColumns: '1fr 1fr 100px 80px' }}
                >
                  {['Member', 'Email', 'Messages', '% of total'].map((col, i) => (
                    <span key={i} className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      {col}
                    </span>
                  ))}
                </div>
                {wsUsage.members
                  .sort((a, b) => b.message_count - a.message_count)
                  .map((m, i) => {
                    const displayName = `${m.first_name} ${m.last_name}`.trim() || m.email
                    const memberPct = wsUsage.total_messages > 0
                      ? Math.round((m.message_count / wsUsage.total_messages) * 100)
                      : 0
                    return (
                      <div
                        key={m.user_id}
                        className={cn('grid items-center gap-4 px-4 py-3', i < wsUsage.members.length - 1 && 'border-b border-border/50')}
                        style={{ gridTemplateColumns: '1fr 1fr 100px 80px' }}
                      >
                        <span className="text-sm text-foreground truncate">{displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground truncate">{m.email}</span>
                        <span className="text-sm text-foreground tabular-nums">{m.message_count.toLocaleString()}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">{memberPct}%</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </>
      )}
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

function ResendButton({ workspaceId, invitationId }: { workspaceId: string; invitationId: string }) {
  const queryClient = useQueryClient()
  const { mutate, isPending, isSuccess } = useMutation({
    mutationFn: () => resendInvitation(workspaceId, invitationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.invitations(workspaceId) }),
  })

  return (
    <button
      onClick={() => mutate()}
      disabled={isPending}
      title="Resend invite"
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        isSuccess
          ? 'text-emerald-400'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {isPending
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : isSuccess
          ? <Check className="h-3.5 w-3.5" />
          : <RotateCcw className="h-3.5 w-3.5" />}
    </button>
  )
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    const url = `${window.location.origin}/invite/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
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

function StatCard({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {pct !== undefined && (
        <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', pct > USAGE_WARNING_THRESHOLD ? 'bg-rose-500' : 'bg-indigo-500')}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  )
}
