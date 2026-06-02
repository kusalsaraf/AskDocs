'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useGoogleLogin } from '@react-oauth/google'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { acceptInvitation } from '@/lib/api/workspaces'

type PageState =
  | 'loading'
  | 'unauthenticated'
  | 'accepting'
  | 'already_member'
  | 'invalid'
  | 'error'

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAuthenticated, isLoading, loginWithGoogle } = useAuth()
  const queryClient = useQueryClient()

  const workspaceName = searchParams.get('workspace') ?? 'a workspace'
  const inviterName = searchParams.get('inviter') ?? 'Someone'

  const [state, setState] = useState<PageState>('loading')

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setState('accepting')
      try {
        await loginWithGoogle(tokenResponse.access_token)
        router.replace('/chat')
      } catch {
        setState('error')
      }
    },
    onError: () => setState('error'),
  })

  const tryAccept = () => {
    setState('accepting')
    acceptInvitation(params.token)
      .then(async () => {
        // Refresh me so the new workspace appears immediately after redirect
        await queryClient.invalidateQueries({ queryKey: ['me'] })
        queryClient.invalidateQueries({ queryKey: ['members'] })
        queryClient.invalidateQueries({ queryKey: ['invitations'] })
        router.replace('/chat')
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 400) setState('already_member')
        else if (status === 404) setState('invalid')
        else setState('error')
      })
  }

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      localStorage.setItem('pending_invite', params.token)
      setState('unauthenticated')
      return
    }
    tryAccept()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {state === 'unauthenticated' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10">
              <span className="text-2xl">✉️</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Join {workspaceName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {inviterName} invited you to collaborate on AskDocs. Sign in to accept.
              </p>
            </div>
            <button
              onClick={() => handleGoogleLogin()}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}

        {state === 'accepting' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-muted-foreground">Joining workspace…</p>
          </div>
        )}

        {state === 'already_member' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
            <div>
              <h1 className="text-base font-semibold text-foreground">
                You're already in {workspaceName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You already have access to this workspace.
              </p>
            </div>
            <button
              onClick={() => router.replace('/chat')}
              className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
            >
              Go to workspace →
            </button>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Invalid invite link
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This invite link is invalid or has expired.
              </p>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Something went wrong
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Could not accept the invitation. Please try again.
              </p>
            </div>
            <button
              onClick={tryAccept}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Retry
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
