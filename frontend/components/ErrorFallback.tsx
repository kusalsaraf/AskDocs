'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { logger } from '@/lib/logger'

interface ErrorFallbackProps {
  error: Error & { digest?: string }
  reset: () => void
  fullScreen?: boolean
}

/**
 * Shared error fallback UI used by both root and app-level error boundaries.
 * Set fullScreen=true for the root boundary (adds min-h-screen + bg).
 */
export function ErrorFallback({ error, reset, fullScreen = false }: ErrorFallbackProps) {
  useEffect(() => {
    logger.error(error)
  }, [error])

  const wrapperClass = fullScreen
    ? 'flex min-h-screen items-center justify-center bg-background'
    : 'flex h-full items-center justify-center'

  return (
    <div className={wrapperClass}>
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle className="h-10 w-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  )
}
