'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/chat/EmptyState'
import { ChatInput } from '@/components/chat/ChatInput'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useCreateConversation } from '@/lib/hooks/useChat'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const router = useRouter()
  const { activeWorkspace } = useWorkspace()
  const { mutateAsync: createConv, isPending } = useCreateConversation(activeWorkspace?.id)

  const handleSubmit = async () => {
    if (!input.trim() || !activeWorkspace) return
    const conv = await createConv()
    router.push(`/chat/${conv.id}?q=${encodeURIComponent(input.trim())}`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <span className="text-sm font-medium text-muted-foreground">New chat</span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <EmptyState onExampleClick={setInput} />
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isPending}
        />
      </div>
    </div>
  )
}
