import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  getDocument,
} from '@/lib/api/documents'
import { adaptDocument } from '@/lib/types/domain'
import type { Document } from '@/lib/types/domain'
import { queryKeys } from '@/lib/constants'

export function useDocuments(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documents(workspaceId),
    queryFn: async () => {
      const docs = await listDocuments(workspaceId!)
      return docs.map(adaptDocument)
    },
    enabled: !!workspaceId,
    staleTime: 15_000,
  })
}

export function useDocumentStatus(
  workspaceId: string | undefined,
  documentId: string | undefined,
  currentStatus: Document['status'] | undefined
) {
  return useQuery({
    queryKey: queryKeys.document(workspaceId, documentId),
    queryFn: async () => adaptDocument(await getDocument(workspaceId!, documentId!)),
    enabled:
      !!workspaceId &&
      !!documentId &&
      (currentStatus === 'pending' || currentStatus === 'processing'),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'ready' || s === 'failed' ? false : 3000
    },
  })
}

export function useUploadDocument(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File
      onProgress?: (pct: number) => void
    }) => uploadDocument(workspaceId!, file, onProgress).then(adaptDocument),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceId) })
    },
  })
}

export function useDeleteDocument(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) => deleteDocument(workspaceId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceId) })
    },
  })
}
