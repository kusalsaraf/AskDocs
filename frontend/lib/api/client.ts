import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth'
import { API_BASE_URL, ROUTES } from '@/lib/constants'

const BASE_URL = API_BASE_URL

export const apiClient = axios.create({ baseURL: BASE_URL })

// Inject Bearer token on every request except public auth endpoints
const PUBLIC_PATHS = ['/auth/google/', '/auth/token/refresh/', '/auth/login/']

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const isPublic = PUBLIC_PATHS.some((p) => config.url?.includes(p))
  if (!isPublic) {
    const token = getAccessToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 → try refresh once, then redirect to /sign-in
let isRefreshing = false
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

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
      if (typeof window !== 'undefined') window.location.href = ROUTES.SIGN_IN
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(apiClient(original))
          },
          reject,
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
      refreshQueue.forEach((cb) => cb.resolve(data.access))
      refreshQueue = []
      original.headers.Authorization = `Bearer ${data.access}`
      return apiClient(original)
    } catch (refreshError) {
      clearTokens()
      refreshQueue.forEach((cb) => cb.reject(refreshError))
      refreshQueue = []
      if (typeof window !== 'undefined') window.location.href = ROUTES.SIGN_IN
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)
