'use client'

import React, { useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { WorkspaceProvider } from '@/lib/contexts/WorkspaceContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAuth } from '@/lib/hooks/useAuth'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useConversations } from '@/lib/hooks/useChat'

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()

  const activeId = pathname.startsWith('/chat/')
    ? pathname.split('/chat/')[1]
    : undefined

  const { data: conversations = [] } = useConversations(activeWorkspace?.id)

  if (!user || !activeWorkspace) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!sidebarCollapsed && (
        <Sidebar
          conversations={conversations}
          activeConversationId={activeId}
          workspace={activeWorkspace}
          user={user}
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {sidebarCollapsed && (
          <div className="absolute top-3 left-3 z-10">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground/70 hover:border-border transition-colors"
              aria-label="Open sidebar"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </AuthGuard>
  )
}
