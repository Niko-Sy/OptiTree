/**
 * useAuthStore — 用户认证状态管理
 *
 * 当前实现使用 localStorage 模拟持久化会话，所有网络请求预留为
 * TODO 注释，便于后续接入真实后端 API。
 */

import { createContext, useContext, useState, useCallback } from 'react'

// ─── Context ──────────────────────────────────────────────────────
const AuthContext = createContext(null)

// ─── Storage helpers ──────────────────────────────────────────────
const SESSION_KEY = 'optitree_session'

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function persistSession(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

// ─── Provider ─────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadSession)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /** 登录
   * @param {{ username: string, password: string, remember: boolean }} credentials
   * TODO: 替换为后端 POST /api/auth/login
   */
  const login = useCallback(async ({ username, password, remember }) => {
    setLoading(true)
    setError(null)
    try {
      // ── TODO: await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
      // 模拟网络延迟
      await new Promise(r => setTimeout(r, 600))

      // 简单前端验证占位（后端接入后删除）
      if (!username || !password) throw new Error('用户名和密码不能为空')

      const sessionUser = {
        id: `user_${Date.now()}`,
        username,
        displayName: username,
        email: `${username}@example.com`,
        avatar: null,         // TODO: 后端返回头像 URL
        role: 'user',
        token: `mock_token_${Date.now()}`,  // TODO: JWT from backend
        loginAt: new Date().toISOString(),
      }

      if (remember) persistSession(sessionUser)
      setUser(sessionUser)
      return sessionUser
    } catch (err) {
      const msg = err.message || '登录失败，请稍后重试'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 注册
   * @param {{ username: string, email: string, password: string }} data
   * TODO: 替换为后端 POST /api/auth/register
   */
  const register = useCallback(async ({ username, email, password }) => {
    setLoading(true)
    setError(null)
    try {
      // ── TODO: await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) })
      await new Promise(r => setTimeout(r, 800))

      const sessionUser = {
        id: `user_${Date.now()}`,
        username,
        displayName: username,
        email,
        avatar: null,
        role: 'user',
        token: `mock_token_${Date.now()}`,
        loginAt: new Date().toISOString(),
      }

      persistSession(sessionUser)
      setUser(sessionUser)
      return sessionUser
    } catch (err) {
      const msg = err.message || '注册失败，请稍后重试'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 登出
   * TODO: 调用后端 POST /api/auth/logout 使 token 失效
   */
  const logout = useCallback(async () => {
    setLoading(true)
    try {
      // ── TODO: await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${user?.token}` } })
      await new Promise(r => setTimeout(r, 300))
    } finally {
      persistSession(null)
      setUser(null)
      setLoading(false)
    }
  }, [])

  /** 更新用户信息（如头像、昵称等）
   * TODO: 替换为后端 PATCH /api/user/profile
   */
  const updateProfile = useCallback(async (patch) => {
    setLoading(true)
    try {
      // ── TODO: await fetch('/api/user/profile', { method: 'PATCH', body: JSON.stringify(patch) })
      await new Promise(r => setTimeout(r, 400))
      setUser(prev => {
        const next = { ...prev, ...patch }
        persistSession(next)
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [])

  /** 修改密码
   * TODO: 替换为后端 POST /api/auth/change-password
   */
  const changePassword = useCallback(async ({ oldPassword, newPassword }) => { // eslint-disable-line
    setLoading(true)
    try {
      // ── TODO: await fetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) })
      await new Promise(r => setTimeout(r, 600))
      // 成功后可强制重新登录
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
      isAuthenticated: !!user,
      login,
      register,
      logout,
      updateProfile,
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
