/**
 * useNotificationStore — 通知中心状态管理
 * 数据来源：后端 API
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  notificationAction,
} from '../services/notificationService'

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2']
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const ROLE_LABEL = { editor: '编辑者', viewer: '查看者', admin: '管理员' }

// ─── 后端通知数据标准化 ────────────────────────────────────────────────────────
function normalizeApiNotification(n = {}) {
  const extra = n.extraJson || n.extra_json || {}
  const isRevoke = extra.action === 'revoke'
  const isInvite = n.type === 'project_invite' || n.type === 'invite'
  const fromName = extra.fromName || extra.inviterName || '某人'
  const projectName = extra.projectName || '某项目'
  const role = extra.role || 'viewer'

  return {
    ...n,
    type: isInvite ? 'invite' : 'system',
    isRevoke,
    title: isInvite
      ? (isRevoke ? '协作邀请已撤销' : '协作邀请')
      : (extra.title || n.title || '系统通知'),
    content: extra.content || (
      isRevoke
        ? `${fromName} 撤销了对你加入项目「${projectName}」的邀请`
        : isInvite
          ? `${fromName} 邀请你加入项目「${projectName}」，担任${ROLE_LABEL[role] || role}`
          : (n.content || '')
    ),
    from: fromName,
    fromInitial: fromName.slice(0, 1).toUpperCase(),
    fromColor: avatarColor(fromName),
    projectId: n.projectId || n.project_id || '',
    projectName,
    role,
    status: isRevoke ? 'revoked' : (extra.status || 'pending'),
    read: n.isRead ?? n.is_read ?? n.read ?? false,
    createdAt: n.createdAt || n.created_at || new Date().toISOString(),
    resourceId: n.resourceId || n.resource_id || '',
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [notifsResult, countResult] = await Promise.allSettled([
        listNotifications({ page: 1, pageSize: 50 }),
        getUnreadCount(),
      ])

      if (notifsResult.status === 'fulfilled') {
        const data = notifsResult.value
        const raw = data?.list || data?.items || (Array.isArray(data) ? data : [])
        setNotifications(raw.map(normalizeApiNotification))
      }

      if (countResult.status === 'fulfilled') {
        const v = countResult.value
        setUnreadCount(typeof v === 'number' ? v : (v?.count ?? v?.unreadCount ?? 0))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const markRead = useCallback(async (id) => {
    markNotificationRead(id).catch(() => {})
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    markAllNotificationsRead().catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  const deleteNotification = useCallback((id) => {
    setNotifications(prev => {
      const target = prev.find(n => n.id === id)
      if (target && !target.read) setUnreadCount(c => Math.max(0, c - 1))
      return prev.filter(n => n.id !== id)
    })
  }, [])

  const acceptInvite = useCallback(async (id) => {
    await notificationAction(id, 'accept')
    await refresh()
  }, [refresh])

  const rejectInvite = useCallback(async (id) => {
    await notificationAction(id, 'reject')
    await refresh()
  }, [refresh])

  return (
    <NotificationContext.Provider
      value={{
        notifications, unreadCount, loading,
        markRead, markAllRead, deleteNotification,
        acceptInvite, rejectInvite, refresh,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
