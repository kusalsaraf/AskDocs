import { apiClient } from './client'
import type {
  ApiProviderResponse,
  ApiSupportedProvider,
  ApiTestConnectionResult,
} from '@/lib/types/api'

export async function getProvider(workspaceId: string): Promise<ApiProviderResponse> {
  const { data } = await apiClient.get<ApiProviderResponse>(
    `/workspaces/${workspaceId}/provider/`
  )
  return data
}

export async function saveProvider(
  workspaceId: string,
  payload: {
    provider_name: string
    api_key?: string
    model_name: string
    temperature: number
    max_tokens: number
    base_url?: string
    azure_region?: string
  }
): Promise<ApiProviderResponse> {
  const { data } = await apiClient.put<ApiProviderResponse>(
    `/workspaces/${workspaceId}/provider/`,
    payload
  )
  return data
}

export async function deleteProvider(workspaceId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/provider/`)
}

export async function testProvider(workspaceId: string): Promise<ApiTestConnectionResult> {
  const { data } = await apiClient.post<ApiTestConnectionResult>(
    `/workspaces/${workspaceId}/provider/test/`
  )
  return data
}

export async function listSupportedProviders(): Promise<ApiSupportedProvider[]> {
  const { data } = await apiClient.get<ApiSupportedProvider[]>('/providers/supported/')
  return data
}
