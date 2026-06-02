'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
  Share2, MoreHorizontal, Pencil, Check, AlertCircle,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { ChatInput } from '@/components/chat/ChatInput'
import { SourcePanel } from '@/components/chat/SourcePanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useConversation, useUpdateTitle, useMessageSources } from '@/lib/hooks/useChat'
import { sendMessageStream } from '@/lib/api/chat'
import type { Message, Citation } from '@/lib/types/domain'
import { cn } from '@/lib/utils'

export default function ConversationPage() {
  const params       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { activeWorkspace } = useWorkspace()
  const queryClient  = useQueryClient()

  const { data: conversation, isLoading } = useConversation(activeWorkspace?.id, params.id)
  const { mutate: saveTitle } = useUpdateTitle(activeWorkspace?.id, params.id)

  const [localMessages, setLocalMessages]             = useState<Message[]>([])
  const [title, setTitle]                             = useState('')
  const [editingTitle, setEditingTitle]               = useState(false)
  const [titleDraft, setTitleDraft]                   = useState('')
  const [input, setInput]                             = useState('')
  const [activeCitationMsgId, setActiveCitationMsgId] = useState<string | null>(null)
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null)
  const [isStreaming, setIsStreaming]                  = useState(false)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const hasAutoSent   = useRef(false)
  const initDone      = useRef(false)

  // Sync from query data on first successful load
  useEffect(() => {
    if (conversation && !initDone.current) {
      initDone.current = true
      setLocalMessages(conversation.messages)
      setTitle(conversation.title)
      setTitleDraft(conversation.title)
    }
  }, [conversation])

  // Auto-send first message from ?q= param (set by chat/page.tsx)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !hasAutoSent.current && initDone.current) {
      hasAutoSent.current = true
      sendMessage(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDone.current])

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

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft.trim() !== title) {
      setTitle(titleDraft.trim())
      saveTitle(titleDraft.trim())
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
            setLocalMessages((prev) =>
              prev.map((m) =>
                m.id === tempAiId
                  ? { ...m, id: event.message_id, content: accContent, isStreaming: false }
                  : m
              )
            )
            queryClient.invalidateQueries({ queryKey: ['conversations', activeWorkspace.id] })
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
      } catch {
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === tempAiId
              ? { ...m, isStreaming: false, streamError: 'Connection failed. Please try again.' }
              : m
          )
        )
      } finally {
        setIsStreaming(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, isStreaming, activeWorkspace, params.id, queryClient, scrollToBottom]
  )

  const handleSubmit = useCallback(() => sendMessage(), [sendMessage])

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
                  {title || 'New conversation'}
                </span>
                <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors">
              <Share2 className="h-3 w-3" />
              Share
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground/70 hover:bg-muted transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
                  onClick={() => router.push('/chat')}
                >
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="py-6 space-y-6 max-w-3xl mx-auto w-full">
            {localMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                activeCitationId={
                  activeCitationMsgId === message.id ? activeCitationIndex : null
                }
                onCitationClick={(c) => handleCitationClick(message.id, c)}
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
  const { data: sources = [], isLoading } = useMessageSources(
    workspaceId,
    conversationId,
    messageId
  )

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
