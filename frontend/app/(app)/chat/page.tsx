'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { EmptyState } from '@/components/chat/EmptyState'
import { ChatInput } from '@/components/chat/ChatInput'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useCreateConversation } from '@/lib/hooks/useChat'
import { useDocuments } from '@/lib/hooks/useDocuments'
import { logger } from '@/lib/logger'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { activeWorkspace } = useWorkspace()
  const { mutateAsync: createConv, isPending } = useCreateConversation(activeWorkspace?.id)
  const { data: documents = [] } = useDocuments(activeWorkspace?.id)
  const noDocuments = !documents.some((d) => d.status === 'ready')

  const handleSubmit = async () => {
    if (!input.trim() || !activeWorkspace || noDocuments) return
    setError(null)
    try {
      const conv = await createConv()
      router.push(`/chat/${conv.id}?q=${encodeURIComponent(input.trim())}`)
    } catch (err) {
      logger.error('Failed to create conversation', err)
      setError('Failed to start a new conversation. Please try again.')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <span className="text-sm font-medium text-muted-foreground">New chat</span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <EmptyState />
        </div>
        {error && (
          <div className="mx-auto mb-2 flex max-w-2xl items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isPending}
          noDocuments={noDocuments}
        />
      </div>
    </div>
  )
}
