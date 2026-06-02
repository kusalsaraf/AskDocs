'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMe } from '@/lib/api/users'
import { setTokens, clearTokens, hasTokens, getRefreshToken } from '@/lib/api/auth'
import { apiClient } from '@/lib/api/client'
import { adaptUser } from '@/lib/types/domain'
import type { User } from '@/lib/types/domain'
import type { ApiWorkspace } from '@/lib/types/api'
import { acceptInvitation } from '@/lib/api/workspaces'

interface AuthContextValue {
  user: User | null
  workspaces: ApiWorkspace[]
  isLoading: boolean
  isAuthenticated: boolean
  loginWithGoogle: (accessToken: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [skipFetch, setSkipFetch] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSkipFetch(!hasTokens())
    setMounted(true)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !skipFetch,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const loginWithGoogle = useCallback(
    async (googleAccessToken: string) => {
      const { data: tokens } = await apiClient.post<{ access: string; refresh: string }>(
        '/auth/google/',
        { access_token: googleAccessToken }
      )
      setTokens(tokens.access, tokens.refresh)
      setSkipFetch(false)
      await queryClient.invalidateQueries({ queryKey: ['me'] })

      const pendingToken = localStorage.getItem('pending_invite')
      if (pendingToken) {
        localStorage.removeItem('pending_invite')
        try {
          await acceptInvitation(pendingToken)
        } catch {
          // ignore — already a member or token invalid; accept page handles state
        }
      }
    },
    [queryClient]
  )

  const logout = useCallback(async () => {
    try {
      const refresh = getRefreshToken()
      if (refresh) await apiClient.post('/auth/logout/', { refresh })
    } catch {
      // best-effort — clear tokens regardless
    }
    clearTokens()
    queryClient.clear()
    setSkipFetch(true)
    if (typeof window !== 'undefined') window.location.href = '/sign-in'
  }, [queryClient])

  const role = data?.workspaces[0]?.role ?? 'member'
  const user = data ? adaptUser(data, role) : null
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider
      value={{
        user,
        workspaces: data?.workspaces ?? [],
        isLoading: !mounted || (!skipFetch && isLoading),
        isAuthenticated,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
