/**
 * Notifications — 通知中心
 * 路由：/notifications
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge, Button, Tabs, Empty, Avatar, Tooltip,
  Popconfirm, message, Tag,
} from 'antd'
import {
  ArrowLeftOutlined, BellOutlined, CheckOutlined,
  DeleteOutlined, InfoCircleOutlined, TeamOutlined,
  InboxOutlined, CloseOutlined,
} from '@ant-design/icons'
import { useNotification } from '../store/useNotificationStore'
import UserAvatar from '../components/common/UserAvatar'

// ─── 时间格式化 ───────────────────────────────────────────────────────────────
function formatTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

const ROLE_LABEL = { editor: '编辑者', viewer: '查看者', admin: '管理员' }
const STATUS_TAG = {
  accepted: <Tag color="success">已接受</Tag>,
  rejected: <Tag color="default">已拒绝</Tag>,
}

// ─── 单条协作邀请 ─────────────────────────────────────────────────────────────
function InviteItem({ item, onAccept, onReject, onDelete, onMarkRead }) {
  const isPending = item.status === 'pending'

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 rounded-xl border transition-colors ${
        item.read
          ? 'bg-white border-gray-100'
          : 'bg-blue-50 border-blue-100'
      }`}
      onClick={() => !item.read && onMarkRead(item.id)}
    >
      {/* 未读蓝点 */}
      {!item.read && (
        <span className="mt-2 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
      )}
      {/* 邀请人头像 */}
      <Avatar
        size={40}
        style={{ backgroundColor: item.fromColor, fontWeight: 600, fontSize: 15, flexShrink: 0 }}
      >
        {item.fromInitial}
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900 leading-5">{item.title}</p>
            <p className="text-sm text-gray-500 mt-0.5 leading-5">{item.content}</p>
            {item.role && (
              <p className="text-xs text-gray-400 mt-1">
                角色：<span className="text-gray-600">{ROLE_LABEL[item.role] || item.role}</span>
              </p>
            )}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
            {formatTime(item.createdAt)}
          </span>
        </div>

        {/* 操作区 */}
        <div className="flex items-center gap-2 mt-3">
          {isPending ? (
            <>
              <Button
                size="small"
                type="primary"
                onClick={(e) => { e.stopPropagation(); onAccept(item.id) }}
              >
                接受
              </Button>
              <Button
                size="small"
                danger
                onClick={(e) => { e.stopPropagation(); onReject(item.id) }}
              >
                拒绝
              </Button>
            </>
          ) : (
            STATUS_TAG[item.status]
          )}
          <Popconfirm
            title="确认删除这条通知？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={(e) => { e?.stopPropagation(); onDelete(item.id) }}
          >
            <Tooltip title="删除">
              <Button
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                className="text-gray-400 hover:text-red-500"
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>
    </div>
  )
}

// ─── 单条系统通知 ──────────────────────────────────────────────────────────────
function SystemItem({ item, onMarkRead, onDelete }) {
  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 rounded-xl border transition-colors ${
        item.read
          ? 'bg-white border-gray-100'
          : 'bg-blue-50 border-blue-100'
      }`}
      onClick={() => !item.read && onMarkRead(item.id)}
    >
      {/* 未读蓝点 */}
      {!item.read ? (
        <span className="mt-2 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
      ) : (
        <span className="w-2 shrink-0" />
      )}
      {/* 图标 */}
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <InfoCircleOutlined className="text-blue-500 text-base" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900 leading-5">{item.title}</p>
            <p className="text-sm text-gray-500 mt-0.5 leading-5">{item.content}</p>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
            {formatTime(item.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {!item.read && (
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined />}
              className="text-gray-400 hover:text-blue-500 text-xs"
              onClick={(e) => { e.stopPropagation(); onMarkRead(item.id) }}
            >
              标为已读
            </Button>
          )}
          <Popconfirm
            title="确认删除这条通知？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={(e) => { e?.stopPropagation(); onDelete(item.id) }}
          >
            <Tooltip title="删除">
              <Button
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                className="text-gray-400 hover:text-red-500"
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>
    </div>
  )
}

// ─── 空状态 ───────────────────────────────────────────────────────────────────
function EmptyState({ text = '暂无通知' }) {
  return (
    <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
      <InboxOutlined className="text-5xl" />
      <p className="text-sm">{text}</p>
    </div>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function Notifications() {
  const navigate = useNavigate()
  const {
    notifications, unreadCount,
    markRead, markAllRead, deleteNotification,
    acceptInvite, rejectInvite,
  } = useNotification()

  const invites = notifications.filter(n => n.type === 'invite')
  const systemNotifs = notifications.filter(n => n.type === 'system')
  const unreadInvites = invites.filter(n => !n.read).length
  const unreadSystem = systemNotifs.filter(n => !n.read).length

  function handleAccept(id) {
    acceptInvite(id)
    message.success('已接受协作邀请')
  }

  function handleReject(id) {
    rejectInvite(id)
    message.info('已拒绝协作邀请')
  }

  function handleDelete(id) {
    deleteNotification(id)
    message.success('通知已删除')
  }

  function handleMarkAllRead() {
    markAllRead()
    message.success('已全部标为已读')
  }

  const tabItems = [
    {
      key: 'all',
      label: (
        <span className="flex items-center gap-1.5">
          全部
          {unreadCount > 0 && (
            <Badge count={unreadCount} size="small" />
          )}
        </span>
      ),
      children: (
        <div className="space-y-3">
          {notifications.length === 0
            ? <EmptyState />
            : notifications.map(n =>
                n.type === 'invite'
                  ? <InviteItem key={n.id} item={n} onAccept={handleAccept} onReject={handleReject} onDelete={handleDelete} onMarkRead={markRead} />
                  : <SystemItem key={n.id} item={n} onMarkRead={markRead} onDelete={handleDelete} />
              )
          }
        </div>
      ),
    },
    {
      key: 'invite',
      label: (
        <span className="flex items-center gap-1.5">
          <TeamOutlined /> 协作邀请
          {unreadInvites > 0 && (
            <Badge count={unreadInvites} size="small" />
          )}
        </span>
      ),
      children: (
        <div className="space-y-3">
          {invites.length === 0
            ? <EmptyState text="暂无协作邀请" />
            : invites.map(n =>
                <InviteItem key={n.id} item={n} onAccept={handleAccept} onReject={handleReject} onDelete={handleDelete} onMarkRead={markRead} />
              )
          }
        </div>
      ),
    },
    {
      key: 'system',
      label: (
        <span className="flex items-center gap-1.5">
          <InfoCircleOutlined /> 系统通知
          {unreadSystem > 0 && (
            <Badge count={unreadSystem} size="small" />
          )}
        </span>
      ),
      children: (
        <div className="space-y-3">
          {systemNotifs.length === 0
            ? <EmptyState text="暂无系统通知" />
            : systemNotifs.map(n =>
                <SystemItem key={n.id} item={n} onMarkRead={markRead} onDelete={handleDelete} />
              )
          }
        </div>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              icon={<ArrowLeftOutlined />}
              type="text"
              onClick={() => navigate(-1)}
              className="text-gray-500"
            />
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <BellOutlined className="text-blue-500" />
            </div>
            <span className="font-semibold text-gray-900">通知中心</span>
            {unreadCount > 0 && (
              <Badge count={unreadCount} className="ml-1" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                size="small"
                icon={<CheckOutlined />}
                onClick={handleMarkAllRead}
              >
                全部已读
              </Button>
            )}
            <UserAvatar size={32} />
          </div>
        </div>
      </header>

      {/* ── 主内容 ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <Tabs
            items={tabItems}
            className="px-2"
            tabBarStyle={{ paddingLeft: 12, paddingRight: 12, marginBottom: 0 }}
            tabBarExtraContent={
              notifications.length > 0 && (
                <span className="text-xs text-gray-400 pr-2">
                  共 {notifications.length} 条，{unreadCount} 条未读
                </span>
              )
            }
          />
        </div>
      </main>
    </div>
  )
}
