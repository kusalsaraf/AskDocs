'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Pencil, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { ChatInput } from '@/components/chat/ChatInput'
import { SourcePanel } from '@/components/chat/SourcePanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useConversation, useUpdateTitle, useMessageSources } from '@/lib/hooks/useChat'
import { useDocuments } from '@/lib/hooks/useDocuments'
import { sendMessageStream } from '@/lib/api/chat'
import type { Message, Citation } from '@/lib/types/domain'
import { getApiErrorMessage } from '@/lib/utils'
import { ERROR_CODES, queryKeys, DEFAULT_CONVERSATION_TITLE } from '@/lib/constants'

export default function ConversationPage() {
  const params       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { activeWorkspace } = useWorkspace()
  const queryClient  = useQueryClient()

  const { data: conversation, isLoading, isError } = useConversation(activeWorkspace?.id, params.id)
  const { mutateAsync: saveTitle } = useUpdateTitle(activeWorkspace?.id, params.id)
  const { data: documents = [] } = useDocuments(activeWorkspace?.id)
  const noDocuments = !documents.some((d) => d.status === 'ready')

  const [localMessages, setLocalMessages]             = useState<Message[]>([])
  const [title, setTitle]                             = useState('')
  const [editingTitle, setEditingTitle]               = useState(false)
  const [titleDraft, setTitleDraft]                   = useState('')
  const [input, setInput]                             = useState('')
  const [activeCitationMsgId, setActiveCitationMsgId] = useState<string | null>(null)
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null)
  const [isStreaming, setIsStreaming]                  = useState(false)
  const [titleError, setTitleError]                    = useState<string | null>(null)

  const [initDone, setInitDone] = useState(false)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const hasAutoSent   = useRef(false)

  // Sync from query data on first successful load
  useEffect(() => {
    if (conversation && !initDone) {
      setInitDone(true)
      setLocalMessages(conversation.messages)
      setTitle(conversation.title)
      setTitleDraft(conversation.title)
    }
  }, [conversation, initDone])

  // Auto-send first message from ?q= param (set by chat/page.tsx)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !hasAutoSent.current && initDone) {
      hasAutoSent.current = true
      router.replace(`/chat/${params.id}`)
      sendMessage(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDone])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleCitationClick = (msgId: string, citation: Citation) => {
    if (activeCitationMsgId === msgId && activeCitationIndex === citation.id) {
      setActiveCitationMsgId(null)
      setActiveCitationIndex(null)
    } else {
      setActiveCitationMsgId(msgId)
      setActiveCitationIndex(citation.id)
    }
  }

  const handleTitleSave = async () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== title) {
      const previous = title
      setTitle(trimmed)
      setTitleError(null)
      try {
        await saveTitle(trimmed)
      } catch (err) {
        setTitle(previous)
        setTitleError(getApiErrorMessage(err))
      }
    }
    setEditingTitle(false)
  }

  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const content = (overrideContent ?? input).trim()
      if (!content || isStreaming || !activeWorkspace) return

      setInput('')
      const tempUserId = `tmp-user-${Date.now()}`
      const tempAiId   = `tmp-ai-${Date.now()}`

      const userMsg: Message = {
        id: tempUserId, role: 'user', content,
        citations: [], createdAt: new Date(),
      }
      const aiMsg: Message = {
        id: tempAiId, role: 'assistant', content: '',
        citations: [], createdAt: new Date(), isStreaming: true,
      }

      setLocalMessages((prev) => [...prev, userMsg, aiMsg])
      setIsStreaming(true)
      scrollToBottom()

      try {
        let accContent = ''

        for await (const event of sendMessageStream(activeWorkspace.id, params.id, content)) {
          if (event.type === 'token') {
            accContent += event.delta
            setLocalMessages((prev) =>
              prev.map((m) =>
                m.id === tempAiId ? { ...m, content: accContent } : m
              )
            )
            scrollToBottom()
          } else if (event.type === 'complete') {
            const streamCitations: Citation[] = Object.entries(event.citations).map(
              ([idx, chunkId]) => ({
                id: parseInt(idx),
                chunkId: chunkId as string,
                documentId: '',
                documentName: '',
                excerpt: '',
                pageNumber: null,
              })
            )
            setLocalMessages((prev) =>
              prev.map((m) =>
                m.id === tempAiId
                  ? { ...m, id: event.message_id, content: accContent, isStreaming: false, citations: streamCitations }
                  : m
              )
            )
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations(activeWorkspace.id) })
          } else if (event.type === 'error') {
            setLocalMessages((prev) =>
              prev.map((m) =>
                m.id === tempAiId
                  ? { ...m, isStreaming: false, streamError: event.message }
                  : m
              )
            )
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error && err.message === ERROR_CODES.RATE_LIMIT
          ? 'You\'ve reached your daily message limit. Please try again tomorrow.'
          : 'Connection failed. Please try again.'
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === tempAiId
              ? { ...m, isStreaming: false, streamError: errorMessage }
              : m
          )
        )
      } finally {
        setIsStreaming(false)
      }
    },
    [input, isStreaming, activeWorkspace, params.id, queryClient, scrollToBottom]
  )

  const handleSubmit = useCallback(() => sendMessage(), [sendMessage])

  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      if (isStreaming) return
      const idx = localMessages.findIndex((m) => m.id === assistantMsgId)
      if (idx < 1) return
      const preceding = localMessages[idx - 1]
      if (preceding.role !== 'user') return
      // Drop the assistant message (and its preceding user turn) from local state, then resend
      setLocalMessages((prev) => prev.slice(0, idx - 1))
      sendMessage(preceding.content)
    },
    [isStreaming, localMessages, sendMessage]
  )

  const activeCitationData =
    activeCitationMsgId
      ? localMessages
          .find((m) => m.id === activeCitationMsgId)
          ?.citations.find((c) => c.id === activeCitationIndex)
      : null

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-indigo-500" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Conversation not found or was deleted.</p>
          <a href="/chat" className="text-sm text-indigo-400 hover:underline">Start a new chat</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Center: chat area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSave()
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  onBlur={handleTitleSave}
                  className="bg-muted border border-border rounded-md px-2.5 py-1 text-sm text-foreground focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 min-w-[240px]"
                />
                <button
                  onClick={handleTitleSave}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setTitleDraft(title); setEditingTitle(true) }}
                className="group flex items-center gap-2 min-w-0"
              >
                <span className="truncate text-sm font-medium text-foreground max-w-[400px]">
                  {title || DEFAULT_CONVERSATION_TITLE}
                </span>
                <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
            {titleError && (
              <span className="text-xs text-rose-400 shrink-0">{titleError}</span>
            )}
          </div>

        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="py-6 px-6 space-y-6 max-w-4xl mx-auto w-full">
            {localMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                activeCitationId={
                  activeCitationMsgId === message.id ? activeCitationIndex : null
                }
                onCitationClick={(c) => handleCitationClick(message.id, c)}
                onRegenerate={
                  message.role === 'assistant' && !message.isStreaming
                    ? () => handleRegenerate(message.id)
                    : undefined
                }
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isStreaming}
          noDocuments={noDocuments}
        />
      </div>

      {/* Right source panel */}
      {activeCitationData && activeCitationMsgId && (
        <SourcePanelLoader
          workspaceId={activeWorkspace?.id ?? ''}
          conversationId={params.id}
          messageId={activeCitationMsgId}
          citationIndex={activeCitationIndex ?? 1}
          onClose={() => {
            setActiveCitationMsgId(null)
            setActiveCitationIndex(null)
          }}
        />
      )}
    </div>
  )
}

// Fetches sources for the active message then renders SourcePanel
function SourcePanelLoader({
  workspaceId,
  conversationId,
  messageId,
  citationIndex,
  onClose,
}: {
  workspaceId: string
  conversationId: string
  messageId: string
  citationIndex: number
  onClose: () => void
}) {
  const { data: sources = [], isLoading, isError } = useMessageSources(
    workspaceId,
    conversationId,
    messageId
  )

  if (isError) {
    return (
      <aside className="w-[320px] shrink-0 border-l border-border/80 bg-card">
        <div className="text-xs text-muted-foreground p-4">Could not load sources.</div>
      </aside>
    )
  }

  if (isLoading) {
    return (
      <aside className="w-[320px] shrink-0 border-l border-border/80 bg-card flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-indigo-500" />
      </aside>
    )
  }

  // citationIndex is 1-based; find matching source by position
  const source = sources[citationIndex - 1] ?? sources[0]
  if (!source) return null

  const citation: Citation = {
    id: citationIndex,
    chunkId: source.chunk_id,
    documentId: source.document_id,
    documentName: source.document_filename,
    excerpt: source.excerpt,
    pageNumber: source.page_number,
  }

  return <SourcePanel citation={citation} onClose={onClose} />
}
