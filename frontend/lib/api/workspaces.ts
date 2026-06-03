import { apiClient } from './client'
import type { ApiWorkspace, ApiMember, ApiPendingInvitation } from '@/lib/types/api'

export async function listWorkspaces(): Promise<ApiWorkspace[]> {
  const { data } = await apiClient.get<{ results: ApiWorkspace[] }>('/workspaces/')
  return data.results
}

export async function createWorkspace(name: string): Promise<ApiWorkspace> {
  const { data } = await apiClient.post<ApiWorkspace>('/workspaces/', { name })
  return data
}

export async function updateWorkspace(id: string, name: string): Promise<ApiWorkspace> {
  const { data } = await apiClient.patch<ApiWorkspace>(`/workspaces/${id}/`, { name })
  return data
}

export async function listMembers(workspaceId: string): Promise<ApiMember[]> {
  const { data } = await apiClient.get<{ results: ApiMember[] }>(`/workspaces/${workspaceId}/members/`)
  return data.results
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/members/${userId}/`)
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  await apiClient.patch(`/workspaces/${workspaceId}/members/${userId}/`, { role })
}

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  await apiClient.post(`/workspaces/${workspaceId}/invitations/`, { email, role })
}

export async function listInvitations(workspaceId: string): Promise<ApiPendingInvitation[]> {
  const { data } = await apiClient.get<{ results: ApiPendingInvitation[] }>(
    `/workspaces/${workspaceId}/invitations/`
  )
  return data.results
}

export async function acceptInvitation(token: string): Promise<{ workspace_id: string }> {
  const { data } = await apiClient.post<{ workspace_id: string }>(`/invitations/${token}/accept/`)
  return data
}

export async function resendInvitation(workspaceId: string, invitationId: string): Promise<void> {
  await apiClient.post(`/workspaces/${workspaceId}/invitations/${invitationId}/resend/`)
}
