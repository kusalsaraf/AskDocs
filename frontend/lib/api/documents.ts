import { apiClient } from './client'
import type { ApiDocument } from '@/lib/types/api'

export async function listDocuments(workspaceId: string): Promise<ApiDocument[]> {
  const { data } = await apiClient.get<ApiDocument[]>(`/workspaces/${workspaceId}/documents/`)
  return data
}

export async function getDocument(workspaceId: string, documentId: string): Promise<ApiDocument> {
  const { data } = await apiClient.get<ApiDocument>(
    `/workspaces/${workspaceId}/documents/${documentId}/`
  )
  return data
}

export async function uploadDocument(
  workspaceId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<ApiDocument> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<ApiDocument>(
    `/workspaces/${workspaceId}/documents/`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100))
      },
    }
  )
  return data
}

export async function deleteDocument(workspaceId: string, documentId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/documents/${documentId}/`)
}
