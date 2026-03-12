/**
 * UserAvatar — 圆形头像 + 下拉菜单
 *
 * Props:
 *   size?      — 头像直径像素，默认 32
 *   theme?     — 'light' | 'dark'，控制触发图标颜色，默认 'light'
 */

import { useNavigate } from 'react-router-dom'
import { Avatar, Dropdown, message } from 'antd'
import {
  UserOutlined, SettingOutlined, LogoutOutlined,
  KeyOutlined, BellOutlined, QuestionCircleOutlined,
  FileProtectOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../store/useAuthStore'
import { useNotification } from '../../store/useNotificationStore'

export default function UserAvatar({ size = 32, theme = 'light' }) {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotification()
  const navigate = useNavigate()

  // ── 生成头像背景色（根据用户名哈希）────────────────────────────
  function avatarColor(name = '') {
    const colors = [
      '#1677ff', '#52c41a', '#f5a623', '#eb2f96',
      '#722ed1', '#13c2c2', '#fa541c', '#2f54eb',
    ]
    let hash = 0
    for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  // ── 取显示名称首字母缩写 ─────────────────────────────────────
  function initials(name = '') {
    const trimmed = name.trim()
    if (!trimmed) return '?'
    const words = trimmed.split(/\s+/)
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    return trimmed.slice(0, 2).toUpperCase()
  }

  // ── 处理登出 ─────────────────────────────────────────────────
  async function handleLogout() {
    try {
      await logout()
      message.success('已退出登录')
      navigate('/login', { replace: true })
    } catch {
      message.error('退出失败，请重试')
    }
  }

  // ── 下拉菜单项 ───────────────────────────────────────────────
  const menuItems = [
    // 用户信息头部
    {
      key: 'profile-header',
      label: (
        <div className="py-1 px-1">
          <p className="font-semibold text-gray-900 text-sm leading-5">
            {user?.displayName || user?.username || '未登录用户'}
          </p>
          <p className="text-xs text-gray-400 truncate max-w-44">{user?.email || '—'}</p>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },

    // 账号功能
    {
      key: 'my-profile',
      icon: <UserOutlined />,
      label: '个人资料',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'notifications',
      icon: <BellOutlined />,
      label: (
        <span className="flex items-center justify-between gap-4">
          通知中心
          {unreadCount > 0 && (
            <span className="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </span>
      ),
      onClick: () => navigate('/notifications'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '账号设置',
      onClick: () => message.info('账号设置即将上线'), // TODO: navigate('/settings')
    },
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => navigate('/profile'),  // 跳转到 Profile 页安全设置卡
    },
    { type: 'divider' },

    // 其他功能
    {
      key: 'access-control',
      icon: <TeamOutlined />,
      label: '团队协作',
      onClick: () => navigate('/team'),
    },
    {
      key: 'audit-log',
      icon: <FileProtectOutlined />,
      label: '操作日志',
      onClick: () => message.info('操作日志即将上线'), // TODO: navigate('/audit')
    },
    {
      key: 'help',
      icon: <QuestionCircleOutlined />,
      label: '帮助与反馈',
      onClick: () => navigate('/help'),
    },
    { type: 'divider' },

    // 退出
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: <span className="text-red-500">退出登录</span>,
      onClick: handleLogout,
    },
  ]

  const displayName = user?.displayName || user?.username || '?'
  const bgColor = avatarColor(displayName)
  const abbr = initials(displayName)

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="bottomRight"
      styles={{ root: { minWidth: 200 } }}
      arrow={{ pointAtCenter: true }}
    >
      <button
        type="button"
        className="flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 transition-transform hover:scale-105 active:scale-95"
        style={{ width: size, height: size }}
        aria-label="用户菜单"
      >
        {user?.avatar ? (
          <Avatar
            src={user.avatar}
            size={size}
            className="cursor-pointer"
            style={{ display: 'block' }}
          />
        ) : (
          <Avatar
            size={size}
            style={{
              backgroundColor: bgColor,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: size <= 28 ? 11 : 13,
              display: 'block',
              lineHeight: `${size}px`,
              userSelect: 'none',
            }}
          >
            {abbr}
          </Avatar>
        )}
      </button>
    </Dropdown>
  )
}
