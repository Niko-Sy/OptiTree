/**
 * useAuthStore — 用户认证状态管理（接入真实后端）
 * Base URL: VITE_API_BASE_URL/api/v1
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { post, get, tokenStore, ApiError, onAuthExpired } from '../services/apiClient'

// ─── Context ──────────────────────────────────────────────────────
const AuthContext = createContext(null)

// ─── 用户信息缓存（localStorage，仅存 user 对象，不含 token）──────
const SESSION_KEY = 'optitree_session'

function loadCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function persistUser(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

function extractUser(data) {
  return data?.user || data || null
}

function extractAccessToken(data) {
  return data?.accessToken || data?.token || ''
}

function extractRefreshToken(data) {
  return data?.refreshToken || ''
}

function extractAvatarUrl(data) {
  return data?.avatarUrl || data?.avatar || data?.url || ''
}

// ─── Provider ─────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  // 初始从缓存恢复，等 fetchMe 完成后会用最新数据覆盖
  const [user, setUser] = useState(loadCachedUser)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 应用启动时：若有 accessToken 则用 /users/me 验证并刷新用户信息
  useEffect(() => {
    if (!tokenStore.getAccess()) {
      return
    }
    get('/api/v1/users/me')
      .then(data => {
        const nextUser = extractUser(data)
        setUser(nextUser)
        persistUser(nextUser)
      })
      .catch(() => {
        // token 已失效，清除本地缓存
        tokenStore.clearAll()
        persistUser(null)
        setUser(null)
      })
  }, []) // eslint-disable-line

  useEffect(() => onAuthExpired(() => {
    persistUser(null)
    setUser(null)
    setError('登录状态已过期，请重新登录')
  }), [])

  /** 登录 — POST /api/v1/auth/login */
  const login = useCallback(async ({ username, password, remember }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await post('/api/v1/auth/login', { username, password, remember })
      tokenStore.setAccess(extractAccessToken(data))
      tokenStore.setRefresh(extractRefreshToken(data))
      const u = extractUser(data)
      persistUser(u)
      setUser(u)
      return u
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err.message || '登录失败，请稍后重试')
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 注册 — POST /api/v1/auth/register，注册后自动登录获取 token */
  const register = useCallback(async ({ username, email, password, agree = true }) => {
    setLoading(true)
    setError(null)
    try {
      // 注册接口只返回 user，无 token；随后自动调 login
      await post('/api/v1/auth/register', { username, email, password, agree })
      const sessionUser = await login({ username, password, remember: false })
      return sessionUser
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err.message || '注册失败，请稍后重试')
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [login])

  /** 登出 — POST /api/v1/auth/logout */
  const logout = useCallback(async () => {
    setLoading(true)
    try {
      const refreshToken = tokenStore.getRefresh()
      await post('/api/v1/auth/logout', { refreshToken }).catch(() => {})
    } finally {
      tokenStore.clearAll()
      persistUser(null)
      setUser(null)
      setLoading(false)
    }
  }, [])

  /** 获取最新用户信息 — GET /api/v1/users/me */
  const fetchMe = useCallback(async () => {
    const data = await get('/api/v1/users/me')
    const nextUser = extractUser(data)
    setUser(nextUser)
    persistUser(nextUser)
    return nextUser
  }, [])

  /** 更新用户资料 — POST /api/v1/users/me/update */
  const updateProfile = useCallback(async (patch) => {
    setLoading(true)
    try {
      const data = await post('/api/v1/users/me/update', patch)
      const u = extractUser(data)
      persistUser(u)
      setUser(u)
      return u
    } finally {
      setLoading(false)
    }
  }, [])

  /** 上传头像 — POST /api/v1/users/me/avatar */
  const uploadAvatar = useCallback(async (file) => {
    setLoading(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const data = await post('/api/v1/users/me/avatar', form)
      const avatarUrl = extractAvatarUrl(data)
      // 更新本地 user avatar
      setUser(prev => {
        const u = { ...prev, avatar: avatarUrl }
        persistUser(u)
        return u
      })
      return avatarUrl
    } finally {
      setLoading(false)
    }
  }, [])

  /** 修改密码 — POST /api/v1/auth/change-password */
  const changePassword = useCallback(async ({ oldPassword, newPassword }) => {
    setLoading(true)
    try {
      await post('/api/v1/auth/change-password', { oldPassword, newPassword })
    } finally {
      setLoading(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      isAuthenticated: !!(user && tokenStore.getAccess()),
      login,
      register,
      logout,
      fetchMe,
      updateProfile,
      uploadAvatar,
      changePassword,
      clearError,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
