'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Plus, MoreHorizontal, FileText, PanelLeftClose } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ConversationSummary, User, Workspace } from '@/lib/types/domain'
import { truncate, cn } from '@/lib/utils'
import { RelativeTime } from '@/components/ui/relative-time'
import { Button } from '@/components/ui/button'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { UserMenu } from './UserMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { deleteConversation } from '@/lib/api/chat'
import { queryKeys, DEFAULT_CONVERSATION_TITLE } from '@/lib/constants'

interface SidebarProps {
  conversations: ConversationSummary[]
  activeConversationId?: string
  workspace: Workspace
  user: User
  onCollapse?: () => void
}

export function Sidebar({
  conversations,
  activeConversationId,
  workspace,
  user,
  onCollapse,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { workspaces, setActiveWorkspace } = useWorkspace()

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border/80 bg-card">
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">AskDocs</span>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground/70 hover:bg-muted transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* New chat button */}
      <div className="px-3 pb-3">
        <Button
          variant="default"
          size="sm"
          className="w-full gap-2 justify-start"
          onClick={() => router.push('/chat')}
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </Button>
      </div>

      {/* Nav links */}
      <div className="px-3 pb-3">
        <Link
          href="/documents"
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
            pathname === '/documents'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Documents
        </Link>
      </div>

      <div className="mx-3 h-px bg-muted/80" />

      {/* Recent conversations */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <p className="px-4 pt-3 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Recent
        </p>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-2 pb-2 space-y-0.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                workspaceId={workspace.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom: workspace + user */}
      <div className="border-t border-border/80 px-2 py-2 space-y-0.5">
        <WorkspaceSwitcher
          workspace={workspace}
          workspaces={workspaces}
          onSwitch={setActiveWorkspace}
        />
        <UserMenu user={user} />
      </div>
    </aside>
  )
}

function ConversationItem({
  conversation,
  isActive,
  workspaceId,
}: {
  conversation: ConversationSummary
  isActive: boolean
  workspaceId: string
}) {
  const queryClient = useQueryClient()
  const router = useRouter()

  const { mutate: delConv } = useMutation({
    mutationFn: () => deleteConversation(workspaceId, conversation.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations(workspaceId) })
      if (isActive) router.push('/chat')
    },
  })

  return (
    <div
      className={cn(
        'group relative flex items-center gap-1 rounded-lg px-2.5 py-2 cursor-pointer transition-colors overflow-hidden min-w-0',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <Link href={`/chat/${conversation.id}`} className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="block truncate text-xs font-medium leading-snug">
          {truncate(conversation.title || DEFAULT_CONVERSATION_TITLE, 38)}
        </span>
        <RelativeTime date={conversation.updatedAt} className="text-[11px] text-muted-foreground/60" />
      </Link>

      {/* Kebab menu — visible on hover */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'h-6 w-6 shrink-0 flex items-center justify-center rounded-md transition-colors',
              'opacity-0 group-hover:opacity-100',
              isActive && 'opacity-100',
              isActive
                ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground/70'
            )}
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-44">
          <DropdownMenuItem
            className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
            onClick={() => delConv()}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
