/**
 * Collaboration — 协作与版本管理页面
 * 路由：/collaboration?id=<projectId>&type=ft|kg
 * 复用 Dashboard 的白色卡片 + 灰色背景风格
 */
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Button, Timeline, Card, Tag, Empty, Modal, Input,
  Select, Avatar, Tooltip, Popconfirm, message, Divider,
  Badge, Space, Typography,
} from 'antd'
import {
  ArrowLeftOutlined, HistoryOutlined, TeamOutlined,
  UserAddOutlined, DownloadOutlined, RollbackOutlined,
  EyeOutlined, DeleteOutlined, ApartmentOutlined, ApiOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useAuth } from '../store/useAuthStore'
import { listVersions, saveVersion } from '../services/aiService'
import UserAvatar from '../components/common/UserAvatar'

const { Text, Title } = Typography
const FT_KEY = 'optitree_projects'
const KG_KEY = 'optitree_kg_list'

// ─── 成员角色配置 ──────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin:   { label: '管理员', color: 'red' },
  editor:  { label: '编辑者', color: 'blue' },
  viewer:  { label: '查看者', color: 'default' },
}

// ─── 头像颜色生成（与 UserAvatar 一致） ───────────────────────────
const AVATAR_COLORS = ['#1677ff','#52c41a','#fa8c16','#722ed1','#eb2f96','#13c2c2']
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

export default function Collaboration() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const projectId = searchParams.get('id')
  const projectType = searchParams.get('type') ?? 'ft'  // ft | kg
  const isKg = projectType === 'kg'

  // ── 读取项目名称 ────────────────────────────────────────────
  let projectName = '未命名'
  try {
    const list = JSON.parse(localStorage.getItem(isKg ? KG_KEY : FT_KEY) || '[]')
    projectName = list.find(p => p.id === projectId)?.name ?? '未命名'
  } catch {}

  // ── 版本历史 ────────────────────────────────────────────────
  const [versions, setVersions] = useState([])
  const [previewVersion, setPreviewVersion] = useState(null)

  const loadVersions = useCallback(async () => {
    if (!projectId) return
    const v = await listVersions(projectId)
    setVersions(v)
  }, [projectId])

  useEffect(() => { loadVersions() }, [loadVersions])

  async function handleSaveVersion() {
    if (!projectId) return
    const snap = isKg
      ? JSON.parse(localStorage.getItem(`optitree_kg_${projectId}`) || '{}')
      : JSON.parse(localStorage.getItem(`optitree_data_${projectId}`) || '{}')

    await saveVersion(projectId, snap, '')
    message.success('版本已保存')
    loadVersions()
  }

  function handleRollback(version) {
    // TODO: diff 对比与回滚逻辑，写回对应 localStorage
    message.info(`已回滚到：${version.label}（TODO: 写入编辑器状态）`)
  }

  function handleDeleteVersion(versionId) {
    try {
      const key = `optitree_versions_${projectId}`
      const list = JSON.parse(localStorage.getItem(key) || '[]')
      localStorage.setItem(key, JSON.stringify(list.filter(v => v.id !== versionId)))
      setVersions(prev => prev.filter(v => v.id !== versionId))
      message.success('版本已删除')
    } catch {}
  }

  // ── 成员管理（localStorage 模拟）──────────────────────────
  const membersKey = `optitree_members_${projectId}`
  const [members, setMembers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(membersKey) || 'null')
      if (saved) return saved
    } catch {}
    // 默认：当前用户为管理员
    return [{ id: user?.id ?? 'self', name: user?.displayName ?? '我', role: 'admin' }]
  })
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')

  useEffect(() => {
    localStorage.setItem(membersKey, JSON.stringify(members))
  }, [members, membersKey])

  function handleInvite() {
    if (!inviteEmail.trim()) { message.error('请输入邮箱'); return }
    const newMember = {
      id: `member_${Date.now()}`,
      name: inviteEmail,
      role: inviteRole,
    }
    setMembers(prev => [...prev, newMember])
    setInviteEmail('')
    setShowInvite(false)
    message.success(`已邀请 ${inviteEmail}（TODO: 实际邮件通知需后端支持）`)
  }

  function handleRemoveMember(id) {
    if (id === (user?.id ?? 'self')) { message.warning('不能移除自己'); return }
    setMembers(prev => prev.filter(m => m.id !== id))
    message.success('已移除成员')
  }

  // ── 导出 ────────────────────────────────────────────────────
  function handleExport(format) {
    const dataKey = isKg ? `optitree_kg_${projectId}` : `optitree_data_${projectId}`
    try {
      const raw = localStorage.getItem(dataKey)
      if (!raw) { message.error('无数据可导出'); return }
      if (format === 'json') {
        const blob = new Blob([raw], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${projectName}.json`
        a.click()
        URL.revokeObjectURL(url)
        message.success('已导出 JSON')
      } else {
        message.info(`${format.toUpperCase()} 导出功能即将上线`)
        // TODO: html2canvas 截图导出 PNG，SVG 格式导出
      }
    } catch {
      message.error('导出失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              icon={<ArrowLeftOutlined />}
              type="text"
              onClick={() => navigate('/dashboard')}
            />
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isKg ? 'bg-purple-100' : 'bg-blue-100'}`}>
              {isKg
                ? <ApiOutlined style={{ color: '#722ed1', fontSize: 16 }} />
                : <ApartmentOutlined style={{ color: '#1677ff', fontSize: 16 }} />
              }
            </div>
            <div>
              <span className="font-semibold text-gray-900">{projectName}</span>
              <Tag color={isKg ? 'purple' : 'blue'} className="ml-2 text-xs">
                {isKg ? '知识图谱' : '故障树'}
              </Tag>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              icon={<HistoryOutlined />}
              size="small"
              onClick={handleSaveVersion}
            >
              保存版本
            </Button>
            <UserAvatar size={32} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── 版本历史（3/5 宽） ── */}
          <div className="lg:col-span-3 space-y-4">
            <Card
              title={
                <span className="font-semibold text-gray-800 flex items-center gap-2">
                  <HistoryOutlined className="text-blue-500" /> 版本历史
                </span>
              }
              extra={
                <Button
                  type="primary"
                  ghost
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={handleSaveVersion}
                >
                  保存当前版本
                </Button>
              }
              className="shadow-sm"
            >
              {versions.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无版本记录，点击「保存当前版本」创建快照"
                />
              ) : (
                <Timeline
                  items={versions.map((v, i) => ({
                    dot: i === 0
                      ? <Badge dot status="processing"><ClockCircleOutlined style={{ fontSize: 12 }} /></Badge>
                      : <ClockCircleOutlined style={{ fontSize: 12 }} />,
                    children: (
                      <div className="flex items-start justify-between group">
                        <div>
                          <div className="font-medium text-gray-800 text-sm">
                            {v.label}
                            {i === 0 && <Tag color="green" className="ml-2 text-xs">最新</Tag>}
                          </div>
                          <Text className="text-xs text-gray-400">
                            {new Date(v.createdAt).toLocaleString('zh-CN')}
                          </Text>
                        </div>
                        <Space className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip title="预览">
                            <Button
                              type="text"
                              icon={<EyeOutlined />}
                              size="small"
                              onClick={() => setPreviewVersion(v)}
                            />
                          </Tooltip>
                          <Tooltip title="回滚到此版本">
                            <Popconfirm
                              title="回滚版本"
                              description="将以此快照覆盖当前内容，确定吗？"
                              onConfirm={() => handleRollback(v)}
                              okText="确定" cancelText="取消"
                            >
                              <Button type="text" icon={<RollbackOutlined />} size="small" />
                            </Popconfirm>
                          </Tooltip>
                          <Tooltip title="删除">
                            <Popconfirm
                              title="删除版本"
                              onConfirm={() => handleDeleteVersion(v.id)}
                              okText="删除" okType="danger" cancelText="取消"
                            >
                              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                            </Popconfirm>
                          </Tooltip>
                        </Space>
                      </div>
                    ),
                  }))}
                />
              )}
            </Card>

            {/* 导出卡片 */}
            <Card title="导出" className="shadow-sm">
              <div className="flex gap-2">
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => handleExport('json')}
                  className="flex-1"
                >
                  JSON
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => handleExport('png')}
                  className="flex-1"
                >
                  PNG
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => handleExport('svg')}
                  className="flex-1"
                >
                  SVG
                </Button>
              </div>
              <Text className="text-xs text-gray-400 mt-2 block">
                PNG/SVG 导出需要打开编辑器后截图（TODO: html2canvas 集成）
              </Text>
            </Card>
          </div>

          {/* ── 成员管理（2/5 宽） ── */}
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={
                <span className="font-semibold text-gray-800 flex items-center gap-2">
                  <TeamOutlined className="text-blue-500" /> 协作成员
                </span>
              }
              extra={
                <Button
                  type="primary"
                  ghost
                  size="small"
                  icon={<UserAddOutlined />}
                  onClick={() => setShowInvite(true)}
                >
                  邀请
                </Button>
              }
              className="shadow-sm"
            >
              <div className="space-y-3">
                {members.map(m => {
                  const cfg = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.viewer
                  return (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar
                          size={32}
                          style={{ background: avatarColor(m.name), flexShrink: 0 }}
                        >
                          {initials(m.name)}
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-gray-700 leading-none">{m.name}</p>
                          <Tag color={cfg.color} className="text-xs mt-0.5">{cfg.label}</Tag>
                        </div>
                      </div>
                      {m.id !== (user?.id ?? 'self') && (
                        <Popconfirm
                          title="移除成员？"
                          onConfirm={() => handleRemoveMember(m.id)}
                          okType="danger" okText="移除" cancelText="取消"
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                        </Popconfirm>
                      )}
                    </div>
                  )
                })}
              </div>

              <Divider style={{ margin: '12px 0 8px' }} />
              <div className="text-xs text-gray-400 space-y-1">
                <p>• <strong>管理员</strong>：编辑、邀请、删除成员</p>
                <p>• <strong>编辑者</strong>：编辑图谱内容</p>
                <p>• <strong>查看者</strong>：只读浏览</p>
                <p className="text-gray-300 mt-1">TODO: 实时协作需 WebSocket 后端支持</p>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* 邀请成员弹窗 */}
      <Modal
        open={showInvite}
        title="邀请协作成员"
        okText="发送邀请"
        cancelText="取消"
        onOk={handleInvite}
        onCancel={() => setShowInvite(false)}
        width={400}
      >
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">邮箱地址</label>
            <Input
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">角色</label>
            <Select
              value={inviteRole}
              onChange={setInviteRole}
              className="w-full"
              options={Object.entries(ROLE_CONFIG).map(([v, c]) => ({
                value: v, label: c.label,
              }))}
            />
          </div>
          <Text className="text-xs text-gray-400">
            TODO: 邮件邀请功能需要后端支持，当前为本地模拟
          </Text>
        </div>
      </Modal>

      {/* 版本预览弹窗 */}
      <Modal
        open={!!previewVersion}
        title={
          <span>版本预览：{previewVersion?.label}</span>
        }
        footer={
          <Button onClick={() => setPreviewVersion(null)}>关闭</Button>
        }
        onCancel={() => setPreviewVersion(null)}
        width={560}
      >
        {previewVersion && (
          <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs overflow-auto max-h-64">
            <pre>{JSON.stringify(previewVersion.snapshot, null, 2)}</pre>
          </div>
        )}
        <Text className="text-xs text-gray-400 mt-2 block">
          TODO: 接入图形化预览渲染（只读模式画布）
        </Text>
      </Modal>
    </div>
  )
}
