import { apiClient } from './client'
import type { MeResponse } from '@/lib/types/api'

export async function getMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/me/')
  return data
}
