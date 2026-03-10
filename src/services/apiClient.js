const ACCESS_TOKEN_KEY = 'optitree_access_token'
const REFRESH_TOKEN_KEY = 'optitree_refresh_token'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '')
  .replace(/\/$/, '')
  .replace(/\/api\/v1$/, '')

const AUTH_EXPIRED_EVENT = 'optitree:auth-expired'

let refreshPromise = null

export class ApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const tokenStore = {
  getAccess() {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || ''
  },
  setAccess(token) {
    if (!token) return
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  },
  getRefresh() {
    return localStorage.getItem(REFRESH_TOKEN_KEY) || ''
  },
  setRefresh(token) {
    if (!token) return
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  },
  clearAll() {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

function emitAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
  }
}

export function onAuthExpired(handler) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}

function buildUrl(path, query) {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      url.searchParams.set(k, String(v))
    })
  }
  return url.toString()
}

function buildHeaders(extraHeaders = {}, body) {
  const headers = { ...extraHeaders }
  const accessToken = tokenStore.getAccess()
  if (accessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  if (!(body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

async function parseResponse(response) {
  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Keep raw text as message fallback.
  }

  if (!response.ok) {
    const msg = parsed?.message || `请求失败 (${response.status})`
    throw new ApiError(msg, {
      code: parsed?.code,
      status: response.status,
      details: parsed,
    })
  }

  if (!parsed) return null

  if (Object.prototype.hasOwnProperty.call(parsed, 'code') && parsed.code !== 0) {
    throw new ApiError(parsed.message || '请求失败', {
      code: parsed.code,
      status: response.status,
      details: parsed,
    })
  }

  if (Object.prototype.hasOwnProperty.call(parsed, 'data')) {
    return parsed.data
  }

  return parsed
}

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) {
    tokenStore.clearAll()
    emitAuthExpired()
    throw new ApiError('登录状态已过期，请重新登录', { status: 401 })
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const data = await parseResponse(response)
      const nextAccessToken = data?.accessToken || data?.token
      const nextRefreshToken = data?.refreshToken || refreshToken

      if (!nextAccessToken) {
        throw new ApiError('刷新登录状态失败', { status: 401, details: data })
      }

      tokenStore.setAccess(nextAccessToken)
      if (nextRefreshToken) {
        tokenStore.setRefresh(nextRefreshToken)
      }

      return nextAccessToken
    })()
      .catch((error) => {
        tokenStore.clearAll()
        emitAuthExpired()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

async function shouldRetryWithRefresh(response, options = {}) {
  if (response.status !== 401) return false
  if (options.retryOnAuth === false) return false
  if (!tokenStore.getRefresh()) return false

  await refreshAccessToken()
  return true
}

async function parseErrorResponse(response) {
  const text = await response.text().catch(() => '')
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  const msg = parsed?.message || text || `请求失败 (${response.status})`
  throw new ApiError(msg, {
    code: parsed?.code,
    status: response.status,
    details: parsed || text,
  })
}

async function request(method, path, body, options = {}) {
  const { query, headers, signal, retryOnAuth = true, responseType = 'json' } = options
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: buildHeaders(headers, body),
    body: body == null ? undefined : (body instanceof FormData ? body : JSON.stringify(body)),
    signal,
  })

  if (await shouldRetryWithRefresh(response, { retryOnAuth })) {
    return request(method, path, body, { ...options, retryOnAuth: false })
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      return parseErrorResponse(response)
    }
    return response.blob()
  }

  return parseResponse(response)
}

export function get(path, query, options = {}) {
  return request('GET', path, null, { ...options, query })
}

export function post(path, body, options = {}) {
  return request('POST', path, body, options)
}

export function put(path, body, options = {}) {
  return request('PUT', path, body, options)
}

export function del(path, options = {}) {
  return request('DELETE', path, null, options)
}

export function download(path, query, options = {}) {
  return request('GET', path, null, { ...options, query, responseType: 'blob' })
}

function emitSseEvent(block, onEvent) {
  const lines = block.split('\n')
  const dataParts = []
  lines.forEach((line) => {
    const clean = line.endsWith('\r') ? line.slice(0, -1) : line
    if (!clean.startsWith('data:')) return
    dataParts.push(clean.slice(5).trimStart())
  })

  if (!dataParts.length) return
  const raw = dataParts.join('\n')
  try {
    onEvent(JSON.parse(raw))
  } catch {
    onEvent({ type: 'content', content: raw })
  }
}

export async function postStream(path, body, { onEvent, signal, retryOnAuth = true } = {}) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      ...buildHeaders({}, body),
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body || {}),
    signal,
  })

  if (await shouldRetryWithRefresh(response, { retryOnAuth })) {
    return postStream(path, body, { onEvent, signal, retryOnAuth: false })
  }

  if (!response.ok) {
    return parseErrorResponse(response)
  }

  if (!response.body) {
    throw new ApiError('浏览器不支持流式响应读取')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let pending = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })

    const blocks = pending.split('\n\n')
    pending = blocks.pop() || ''
    blocks.forEach((block) => emitSseEvent(block, (event) => onEvent?.(event)))
  }

  if (pending.trim()) {
    emitSseEvent(pending, (event) => onEvent?.(event))
  }
}
