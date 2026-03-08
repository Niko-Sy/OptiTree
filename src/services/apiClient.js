/**
 * apiClient.js — 统一 HTTP 客户端
 * - 自动注入 Bearer token
 * - code != 0 时抛出业务错误
 * - 401 时自动尝试刷新 token 并重试一次原请求
 * - refresh 失败则清除 token，跳转 /login
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// ─── Token 存储 ────────────────────────────────────────────────────
const TOKEN_KEY = 'optitree_access_token'
const REFRESH_KEY = 'optitree_refresh_token'

export const tokenStore = {
  getAccess:    ()    => localStorage.getItem(TOKEN_KEY),
  getRefresh:   ()    => localStorage.getItem(REFRESH_KEY),
  setAccess:    (t)   => localStorage.setItem(TOKEN_KEY, t),
  setRefresh:   (t)   => localStorage.setItem(REFRESH_KEY, t),
  clearAll:     ()    => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem('optitree_session')
  },
}

// ─── 业务错误类 ────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(code, message, errors) {
    super(message)
    this.code = code
    this.errors = errors
  }
}

// ─── 内部：原始 fetch 包装（不含 refresh 逻辑）────────────────────
async function rawFetch(path, options = {}) {
  const token = tokenStore.getAccess()
  const headers = {
    ...(!options._isFormData && { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  return res
}

// ─── refresh token ─────────────────────────────────────────────────
let refreshPromise = null  // 防止并发 refresh

async function doRefresh() {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) throw new Error('无 refresh token')

  const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) throw new Error('refresh 失败')

  tokenStore.setAccess(json.data.accessToken)
  tokenStore.setRefresh(json.data.refreshToken)
}

// ─── 主请求函数 ────────────────────────────────────────────────────
export async function request(path, options = {}) {
  let res = await rawFetch(path, options)

  // HTTP 401 → 尝试刷新
  if (res.status === 401) {
    try {
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => { refreshPromise = null })
      }
      await refreshPromise
      res = await rawFetch(path, options)  // 刷新后重试
    } catch {
      tokenStore.clearAll()
      window.location.href = '/login'
      throw new ApiError(40100, '登录已过期，请重新登录')
    }
  }

  // 导出接口直接返回 Blob
  if (options._blob) {
    if (!res.ok) throw new ApiError(res.status, '请求失败')
    return res.blob()
  }

  const json = await res.json()

  // 业务错误
  if (json.code !== 0) {
    throw new ApiError(json.code, json.message || '请求失败', json.errors)
  }

  return json.data
}

// ─── 快捷方法 ──────────────────────────────────────────────────────
export const get  = (path, params, opts) => {
  const url = params
    ? `${path}?${new URLSearchParams(Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ))}`
    : path
  return request(url, { method: 'GET', ...opts })
}

export const post = (path, body, opts)   =>
  request(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
    _isFormData: body instanceof FormData,
    ...opts,
  })
