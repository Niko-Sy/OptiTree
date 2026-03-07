/**
 * Profile — 用户资料页面
 * 路由：/profile
 * 布局：渐变背景 + 居中白色卡片（与 Login/Register 风格一致）
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Form, Input, Button, Avatar, Tag, Divider,
  Typography, message, Tooltip, Alert,
} from 'antd'
import {
  ArrowLeftOutlined, UserOutlined, MailOutlined,
  LockOutlined, SafetyCertificateOutlined, EditOutlined,
  GithubOutlined, WechatOutlined,
} from '@ant-design/icons'
import { useAuth } from '../store/useAuthStore'

const { Text, Title } = Typography

// ─── 头像颜色生成（与 UserAvatar.jsx 一致） ─────────────────────
const AVATAR_COLORS = ['#1677ff','#52c41a','#fa8c16','#722ed1','#eb2f96','#13c2c2','#f5222d','#08979c']
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, updateProfile, changePassword } = useAuth()
  const [profileForm] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [profileLoading, setProfileLoading] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)

  // ── 提交基本信息 ─────────────────────────────────────────────
  async function handleProfileSave() {
    try {
      const values = await profileForm.validateFields()
      setProfileLoading(true)
      await updateProfile({ displayName: values.displayName, email: values.email })
      message.success('个人信息已更新')
    } catch (err) {
      if (err?.errorFields) return  // 校验错误，antd 已提示
      message.error(err?.message || '更新失败，请重试')
    } finally {
      setProfileLoading(false)
    }
  }

  // ── 修改密码 ──────────────────────────────────────────────────
  async function handlePwdChange() {
    try {
      const values = await pwdForm.validateFields()
      setPwdLoading(true)
      await changePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword })
      message.success('密码修改成功')
      pwdForm.resetFields()
    } catch (err) {
      if (err?.errorFields) return
      message.error(err?.message || '密码修改失败')
    } finally {
      setPwdLoading(false)
    }
  }

  const loginAt = user?.loginAt
    ? new Date(user.loginAt).toLocaleString('zh-CN')
    : '—'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* 顶部栏 */}
      <div className="max-w-2xl mx-auto px-6 pt-6">
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => navigate('/dashboard')}
          className="mb-4"
        >
          返回仪表盘
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-12 space-y-5">

        {/* ── 基本信息卡 ── */}
        <Card className="shadow-sm rounded-2xl">
          <div className="flex items-center gap-4 mb-6">
            <Tooltip title="TODO: 点击上传头像">
              <div className="relative cursor-pointer group">
                {user?.avatar ? (
                  <Avatar size={72} src={user.avatar} />
                ) : (
                  <Avatar
                    size={72}
                    style={{ background: avatarColor(user?.displayName ?? ''), fontSize: 24, fontWeight: 700 }}
                  >
                    {initials(user?.displayName ?? '')}
                  </Avatar>
                )}
                <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <EditOutlined className="text-white text-lg" />
                </div>
              </div>
            </Tooltip>
            <div>
              <Title level={5} className="mb-0">{user?.displayName}</Title>
              <Text className="text-gray-500 text-sm">{user?.email}</Text>
              <div className="mt-1">
                <Tag color="blue">{user?.role === 'admin' ? '管理员' : '普通用户'}</Tag>
              </div>
            </div>
          </div>

          <Divider style={{ margin: '0 0 20px' }} />

          <Form
            form={profileForm}
            layout="vertical"
            initialValues={{
              displayName: user?.displayName ?? '',
              email: user?.email ?? '',
            }}
          >
            <Form.Item
              name="displayName"
              label="显示名称"
              rules={[
                { required: true, message: '请输入显示名称' },
                { max: 30, message: '不超过 30 个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="显示名称"
              />
            </Form.Item>

            <Form.Item
              name="email"
              label="邮箱地址"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
            >
              <Input
                prefix={<MailOutlined className="text-gray-400" />}
                placeholder="email@example.com"
              />
            </Form.Item>

            <Button
              type="primary"
              loading={profileLoading}
              onClick={handleProfileSave}
              className="w-full"
            >
              保存修改
            </Button>
          </Form>
        </Card>

        {/* ── 安全设置卡 ── */}
        <Card
          className="shadow-sm rounded-2xl"
          title={
            <span className="flex items-center gap-2 font-semibold">
              <LockOutlined className="text-blue-500" /> 安全设置
            </span>
          }
        >
          <Form form={pwdForm} layout="vertical">
            <Form.Item
              name="oldPassword"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="当前密码"
              />
            </Form.Item>

            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 8, message: '密码至少 8 位' },
                {
                  pattern: /(?=.*[a-zA-Z])(?=.*\d)/,
                  message: '密码需包含字母和数字',
                },
              ]}
            >
              <Input.Password
                prefix={<SafetyCertificateOutlined className="text-gray-400" />}
                placeholder="新密码（至少 8 位，含字母和数字）"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value)
                      return Promise.resolve()
                    return Promise.reject(new Error('两次密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="确认新密码"
              />
            </Form.Item>

            <Button
              type="primary"
              ghost
              loading={pwdLoading}
              onClick={handlePwdChange}
              className="w-full"
            >
              修改密码
            </Button>
          </Form>
        </Card>

        {/* ── 账号信息卡（只读） ── */}
        <Card
          className="shadow-sm rounded-2xl"
          title={
            <span className="flex items-center gap-2 font-semibold">
              <UserOutlined className="text-blue-500" /> 账号信息
            </span>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <Text className="text-gray-500 text-sm">用户 ID</Text>
              <Text className="text-gray-700 font-mono text-xs">{user?.id}</Text>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <Text className="text-gray-500 text-sm">用户名</Text>
              <Text className="text-gray-700 text-sm">{user?.username}</Text>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <Text className="text-gray-500 text-sm">角色</Text>
              <Tag color="blue">{user?.role === 'admin' ? '管理员' : '普通用户'}</Tag>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <Text className="text-gray-500 text-sm">最近登录</Text>
              <Text className="text-gray-700 text-sm">{loginAt}</Text>
            </div>

            <Divider style={{ margin: '8px 0' }} />

            {/* 社交绑定（TODO） */}
            <div>
              <Text className="text-gray-500 text-sm block mb-3">社交账号绑定</Text>
              <div className="flex gap-2">
                <Button icon={<GithubOutlined />} size="small" disabled>
                  GitHub（TODO）
                </Button>
                <Button icon={<WechatOutlined />} size="small" disabled style={{ color: '#07c160', borderColor: '#07c160' }}>
                  微信（TODO）
                </Button>
              </div>
              <Alert
                type="info"
                showIcon={false}
                message="社交账号绑定功能需要后端 OAuth 支持（TODO）"
                className="mt-3 text-xs"
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
