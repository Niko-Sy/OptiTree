/**
 * useNotificationStore — 通知中心状态管理
 * 数据持久化至 localStorage，纯前端 mock
 */
import { createContext, useContext, useReducer, useEffect, useCallback } from 'react'

// ─── 默认 Mock 数据 ──────────────────────────────────────────────────────────
const MOCK_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'invite',
    title: '协作邀请',
    content: 'Alice 邀请你加入项目「动力系统故障树分析」，担任编辑者',
    from: 'Alice',
    fromInitial: 'A',
    fromColor: '#1677ff',
    projectId: 'proj-001',
    projectName: '动力系统故障树分析',
    role: 'editor',
    status: 'pending',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30分钟前
  },
  {
    id: 'n2',
    type: 'invite',
    title: '协作邀请',
    content: 'Bob 邀请你加入项目「电气系统知识图谱」，担任查看者',
    from: 'Bob',
    fromInitial: 'B',
    fromColor: '#52c41a',
    projectId: 'proj-002',
    projectName: '电气系统知识图谱',
    role: 'viewer',
    status: 'pending',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2小时前
  },
  {
    id: 'n3',
    type: 'invite',
    title: '协作邀请',
    content: 'Carol 邀请你加入项目「液压制动失效分析」，担任管理员',
    from: 'Carol',
    fromInitial: 'C',
    fromColor: '#722ed1',
    projectId: 'proj-003',
    projectName: '液压制动失效分析',
    role: 'admin',
    status: 'accepted',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1天前
  },
  {
    id: 'n4',
    type: 'system',
    title: '系统更新',
    content: 'OptiTree v2.4.0 已发布：新增 AI 辅助节点分析功能，支持批量导入故障树模板，优化画布渲染性能。',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5小时前
  },
  {
    id: 'n5',
    type: 'system',
    title: '新功能上线',
    content: '知识图谱实体关系自动推断功能已上线，前往知识图谱编辑器中体验 AI 自动建图。',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3天前
  },
]

const STORAGE_KEY = 'optitree_notifications'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return MOCK_NOTIFICATIONS
}

function saveToStorage(notifications) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
  } catch {
    // ignore
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state, action) {
  let next
  switch (action.type) {
    case 'MARK_READ':
      next = state.map(n => n.id === action.id ? { ...n, read: true } : n)
      break
    case 'MARK_ALL_READ':
      next = state.map(n => ({ ...n, read: true }))
      break
    case 'DELETE':
      next = state.filter(n => n.id !== action.id)
      break
    case 'ACCEPT_INVITE':
      next = state.map(n =>
        n.id === action.id && n.type === 'invite'
          ? { ...n, status: 'accepted', read: true }
          : n
      )
      break
    case 'REJECT_INVITE':
      next = state.map(n =>
        n.id === action.id && n.type === 'invite'
          ? { ...n, status: 'rejected', read: true }
          : n
      )
      break
    default:
      return state
  }
  saveToStorage(next)
  return next
}

// ─── Context ─────────────────────────────────────────────────────────────────
const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, dispatch] = useReducer(reducer, null, loadFromStorage)

  const unreadCount = notifications.filter(n => !n.read).length

  const markRead = useCallback((id) => dispatch({ type: 'MARK_READ', id }), [])
  const markAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_READ' }), [])
  const deleteNotification = useCallback((id) => dispatch({ type: 'DELETE', id }), [])
  const acceptInvite = useCallback((id) => dispatch({ type: 'ACCEPT_INVITE', id }), [])
  const rejectInvite = useCallback((id) => dispatch({ type: 'REJECT_INVITE', id }), [])

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markRead, markAllRead, deleteNotification, acceptInvite, rejectInvite }}
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
