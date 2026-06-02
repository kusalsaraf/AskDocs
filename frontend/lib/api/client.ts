import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

export const apiClient = axios.create({ baseURL: BASE_URL })

// Inject Bearer token on every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 → try refresh once, then redirect to /sign-in
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error)
    }

    const refresh = getRefreshToken()
    if (!refresh) {
      clearTokens()
      if (typeof window !== 'undefined') window.location.href = '/sign-in'
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(apiClient(original))
        })
      })
    }

    isRefreshing = true
    original._retried = true

    try {
      const { data } = await axios.post<{ access: string; refresh: string }>(
        `${BASE_URL}/auth/token/refresh/`,
        { refresh }
      )
      setTokens(data.access, data.refresh)
      refreshQueue.forEach((cb) => cb(data.access))
      refreshQueue = []
      original.headers.Authorization = `Bearer ${data.access}`
      return apiClient(original)
    } catch {
      clearTokens()
      refreshQueue = []
      if (typeof window !== 'undefined') window.location.href = '/sign-in'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)
