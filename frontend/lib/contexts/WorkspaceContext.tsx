'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { adaptWorkspace } from '@/lib/types/domain'
import type { Workspace } from '@/lib/types/domain'
import type { ApiWorkspace } from '@/lib/types/api'

const STORAGE_KEY = 'askdocs_active_workspace'

interface WorkspaceContextValue {
  activeWorkspace: Workspace | null
  rawWorkspaces: ApiWorkspace[]
  workspaces: Workspace[]
  setActiveWorkspace: (ws: Workspace) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { workspaces: rawWorkspaces } = useAuth()
  const queryClient = useQueryClient()
  const adapted = rawWorkspaces.map(adaptWorkspace)

  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)

  // Initialise active workspace from localStorage or first personal workspace
  useEffect(() => {
    if (!adapted.length) return
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    const match = saved ? adapted.find((w) => w.id === saved) : null
    const defaultWs = match ?? adapted.find((w) => w.is_personal) ?? adapted[0]
    setActiveWorkspaceState(defaultWs ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawWorkspaces])

  const setActiveWorkspace = useCallback(
    (ws: Workspace) => {
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, ws.id)
      setActiveWorkspaceState(ws)
      queryClient.removeQueries({ queryKey: ['documents'] })
      queryClient.removeQueries({ queryKey: ['conversations'] })
    },
    [queryClient]
  )

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        rawWorkspaces,
        workspaces: adapted,
        setActiveWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceProvider')
  return ctx
}
