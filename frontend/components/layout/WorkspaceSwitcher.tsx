'use client'

import React, { useState } from 'react'
import { ChevronsUpDown, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Workspace } from '@/lib/types/domain'
import { adaptWorkspace } from '@/lib/types/domain'
import { createWorkspace } from '@/lib/api/workspaces'
import { queryKeys } from '@/lib/constants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface WorkspaceSwitcherProps {
  workspace: Workspace
  workspaces: Workspace[]
  onSwitch: (ws: Workspace) => void
}

export function WorkspaceSwitcher({ workspace, workspaces, onSwitch }: WorkspaceSwitcherProps) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const { mutate: doCreate } = useMutation({
    mutationFn: () => createWorkspace(newName.trim()),
    onSuccess: (api) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me() })
      onSwitch(adaptWorkspace(api))
      setCreating(false)
      setNewName('')
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted transition-colors group">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold">
              {workspace.logoInitials.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{workspace.name}</p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} className="gap-2.5" onClick={() => onSwitch(ws)}>
              <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-indigo-400 font-mono text-[9px] font-bold">
                {ws.logoInitials.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm">{ws.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {ws.is_personal ? 'Personal' : 'Team'}
                </p>
              </div>
              {ws.id === workspace.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-muted-foreground"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Create workspace…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create workspace mini-modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
            <p className="mb-3 text-sm font-medium text-foreground">New workspace</p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) doCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="Workspace name"
              className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => newName.trim() && doCreate()}
                className="px-3 py-1.5 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
