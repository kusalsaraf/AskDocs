'use client'

import React, { useState, useMemo } from 'react'
import { Search, Upload, LayoutGrid, List, FileQuestion, AlertCircle, RefreshCw } from 'lucide-react'
import type { DocumentStatus } from '@/lib/types/domain'
import { cn, getApiErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DocumentCard, DocumentRow } from '@/components/documents/DocumentCard'
import { UploadModal } from '@/components/documents/UploadModal'
import { useDocuments, useDeleteDocument } from '@/lib/hooks/useDocuments'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { useAuth } from '@/lib/hooks/useAuth'

type ViewMode = 'grid' | 'list'
type FilterKey = 'all' | DocumentStatus

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',        label: 'All'        },
  { key: 'ready',      label: 'Ready'      },
  { key: 'processing', label: 'Processing' },
  { key: 'failed',     label: 'Failed'     },
]

export default function DocumentsPage() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const isAdmin = activeWorkspace?.role === 'admin'
  const {
    data: documents = [],
    isLoading,
    isError,
    refetch,
  } = useDocuments(activeWorkspace?.id)
  const { mutateAsync: doDelete } = useDeleteDocument(activeWorkspace?.id)

  const [viewMode, setViewMode]           = useState<ViewMode>('grid')
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter]   = useState<FilterKey>('all')
  const [searchQuery, setSearchQuery]     = useState('')
  const [uploadOpen, setUploadOpen]       = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const counts: Record<FilterKey, number> = useMemo(
    () => ({
      all:        documents.length,
      ready:      documents.filter((d) => d.status === 'ready').length,
      processing: documents.filter((d) => d.status === 'processing' || d.status === 'pending').length,
      failed:     documents.filter((d) => d.status === 'failed').length,
      pending:    documents.filter((d) => d.status === 'pending').length,
    }),
    [documents]
  )

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'processing'
          ? doc.status === 'processing' || doc.status === 'pending'
          : doc.status === activeFilter)
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [documents, activeFilter, searchQuery])

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-rose-400" />
          <p className="text-sm text-foreground">Failed to load documents</p>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />

      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
            <p className="mb-1 text-sm font-medium text-foreground">Delete document?</p>
            <p className="mb-4 text-xs text-muted-foreground">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  try {
                    await doDelete(deleteConfirmId)
                    setDeleteConfirmId(null)
                  } catch (err) {
                    setError(getApiErrorMessage(err))
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-4 border-b border-border/60 px-6 py-3.5">
          <h1 className="text-sm font-medium text-foreground shrink-0">Documents</h1>

          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full rounded-lg border border-border bg-card py-1.5 pl-9 pr-3',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10',
                  'transition-all duration-150'
                )}
              />
            </div>
          </div>

          <Button size="sm" className="gap-2 shrink-0" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Upload documents
          </Button>
        </div>

        {error && (
          <div className="mx-6 mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            {error}
          </div>
        )}

        {/* Filter row */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-2.5">
          <div className="flex items-center gap-1">
            {FILTERS.map(({ key, label }) => {
              const count = counts[key]
              const active = activeFilter === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-100',
                    active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground/70 hover:bg-muted/60'
                  )}
                >
                  {label}
                  {!isLoading && (
                    <span
                      className={cn(
                        'ml-1.5 font-mono text-[10px]',
                        active ? 'text-muted-foreground' : 'text-muted-foreground/60'
                      )}
                    >
                      ({count})
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <ViewToggleButton
              active={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </ViewToggleButton>
            <ViewToggleButton
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </ViewToggleButton>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <SkeletonGrid />
          ) : filtered.length === 0 ? (
            <EmptyState onUpload={() => setUploadOpen(true)} hasQuery={searchQuery.length > 0} />
          ) : viewMode === 'grid' ? (
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((doc) => {
                  const canDelete = isAdmin || doc.uploadedBy.id === user?.id
                  return (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onClick={() => {}}
                      onDelete={() => { setError(null); setDeleteConfirmId(doc.id) }}
                      canDelete={canDelete}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <ListView documents={filtered} onDelete={(id) => { setError(null); setDeleteConfirmId(id) }} isAdmin={isAdmin} userId={user?.id} />
          )}
        </div>
      </div>
    </>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ViewToggleButton({
  active, onClick, label, children,
}: {
  active: boolean; onClick: () => void; label: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}

function ListView({
  documents,
  onDelete,
  isAdmin,
  userId,
}: {
  documents: ReturnType<typeof useDocuments>['data'] & object[]
  onDelete: (id: string) => void
  isAdmin: boolean
  userId: string | undefined
}) {
  return (
    <div>
      <div
        className="grid items-center gap-4 px-4 py-2 border-b border-border/80"
        style={{ gridTemplateColumns: '1fr 88px 128px 100px auto auto' }}
      >
        {['Name', 'Size', 'Uploaded by', 'Date', 'Status', ''].map((col, i) => (
          <span
            key={i}
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
          >
            {col}
          </span>
        ))}
      </div>
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          document={doc}
          onClick={() => {}}
          onDelete={() => onDelete(doc.id)}
          canDelete={isAdmin || doc.uploadedBy.id === userId}
        />
      ))}
    </div>
  )
}

function EmptyState({ onUpload, hasQuery }: { onUpload: () => void; hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] py-16 px-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted ring-1 ring-border">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-medium text-foreground mb-2">
        {hasQuery ? 'No documents match your search' : 'No documents yet'}
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
        {hasQuery
          ? 'Try a different search term or clear the filter.'
          : "Upload your first document to start asking questions across your team's knowledge base."}
      </p>
      {!hasQuery && (
        <Button size="sm" className="gap-2" onClick={onUpload}>
          <Upload className="h-3.5 w-3.5" />
          Upload documents
        </Button>
      )}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col rounded-xl border border-border bg-card p-4 gap-3">
            <div className="flex items-start justify-between">
              <div className="h-9 w-9 rounded-lg shimmer" />
              <div className="h-5 w-14 rounded-full shimmer" />
            </div>
            <div className="space-y-2 mt-1">
              <div className="h-3.5 w-full rounded-full shimmer" />
              <div className="h-3.5 w-3/4 rounded-full shimmer" />
            </div>
            <div className="mt-auto h-3 w-2/3 rounded-full shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}
