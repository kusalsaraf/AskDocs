'use client'

import React, { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileText, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '@/lib/hooks/useAuth'
import { cn } from '@/lib/utils'

// ── Google G SVG ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = resolvedTheme === 'dark'
  return (
    <button
      onClick={() => mounted && setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className={cn(
        'fixed right-4 top-4 rounded-lg p-2 transition-colors',
        'text-muted-foreground hover:text-foreground',
        'hover:bg-muted border border-transparent hover:border-border'
      )}
    >
      {mounted ? (
        isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        <span className="block h-4 w-4" />
      )}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loginWithGoogle, isAuthenticated } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDemoMode = searchParams.get('demo') === '1'

  // If already authenticated, send to /chat
  useEffect(() => {
    if (isAuthenticated) router.replace('/chat')
  }, [isAuthenticated, router])

  const handleGoogle = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      setError(null)
      try {
        await loginWithGoogle(tokenResponse.access_token)
        router.replace('/chat')
      } catch {
        setError('Sign-in failed. Please try again.')
        setGoogleLoading(false)
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed.')
      setGoogleLoading(false)
    },
  })

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <ThemeToggle />

      <p className="mb-8 text-sm text-muted-foreground text-center">
        Chat with your company&apos;s documents. Get answers with sources.
      </p>

      <div className="w-full max-w-[400px] rounded-xl border border-border bg-card p-8 shadow-xl shadow-black/10 dark:shadow-black/40">
        {/* Logo + headings */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/20">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-medium tracking-tight text-foreground">
              Welcome to AskDocs
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to access your workspace
            </p>
          </div>
        </div>

        {/* Demo mode banner */}
        {isDemoMode && (
          <div className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400 ring-1 ring-amber-500/20">
            Demo mode requires sign-in. Please sign in with Google to continue.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400 ring-1 ring-rose-500/20">
            {error}
          </div>
        )}

        {/* Google CTA */}
        <button
          onClick={() => {
            setGoogleLoading(true)
            handleGoogle()
          }}
          disabled={googleLoading}
          className={cn(
            'flex w-full items-center justify-center gap-3 rounded-lg px-4 py-2.5',
            'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700',
            'text-sm font-medium text-white',
            'transition-colors duration-150',
            'disabled:opacity-70 disabled:cursor-not-allowed'
          )}
        >
          {googleLoading ? <Spinner /> : <GoogleIcon />}
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Demo CTA */}
        <button
          onClick={() => router.push('/sign-in?demo=1')}
          className={cn(
            'flex w-full items-center justify-center rounded-lg px-4 py-2.5',
            'border border-border',
            'text-sm font-medium text-muted-foreground',
            'hover:border-zinc-400 hover:text-foreground dark:hover:border-border/60',
            'transition-colors duration-150'
          )}
        >
          Try the demo
        </button>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
          By signing in, you agree to our{' '}
          <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Terms
          </a>{' '}
          and{' '}
          <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
