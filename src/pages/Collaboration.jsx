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
  Badge, Space, Typography, Spin,
} from 'antd'
import {
  ArrowLeftOutlined, HistoryOutlined, TeamOutlined,
  UserAddOutlined, DownloadOutlined, RollbackOutlined,
  EyeOutlined, DeleteOutlined, ApartmentOutlined, ApiOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useAuth } from '../store/useAuthStore'
import UserAvatar from '../components/common/UserAvatar'
import {
  listVersions, createVersion, rollbackVersion, deleteVersion,
  listMembers, inviteMember, updateMemberRole, removeMember,
} from '../services/collaborationService'
import { getProject } from '../services/projectService'
import { exportFaultTree } from '../services/faultTreeService'
import { exportKnowledgeGraph } from '../services/knowledgeGraphService'
import { buildFaultTreeSVG, buildKgSVG, downloadSvg, downloadSvgAsPng } from '../utils/exportUtils'

const { Text } = Typography

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

  // ── 项目基本信息 ────────────────────────────────────────────
  const [projectName, setProjectName] = useState('未命名')

  useEffect(() => {
    if (!projectId) return
    getProject(projectId)
      .then(({ project }) => setProjectName(project?.name ?? '未命名'))
      .catch(() => {})
  }, [projectId])

  // ── 版本历史 ────────────────────────────────────────────────
  const [versions, setVersions]       = useState([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [previewVersion, setPreviewVersion]   = useState(null)

  const loadVersions = useCallback(async () => {
    if (!projectId) return
    setVersionsLoading(true)
    try {
      const data = await listVersions(projectId)
      setVersions(data.list || [])
    } catch (err) {
      message.error(err?.message || '版本列表加载失败')
    } finally {
      setVersionsLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadVersions() }, [loadVersions])

  async function handleSaveVersion() {
    if (!projectId) return
    try {
      const ver = await createVersion(projectId, { description: '' })
      message.success(`版本 ${ver.label ?? ver.id} 已保存`)
      loadVersions()
    } catch (err) {
      message.error(err?.message || '版本保存失败')
    }
  }

  async function handleRollback(version) {
    try {
      await rollbackVersion(projectId, version.id, { saveCurrent: true })
      message.success(`已回滚到：${version.label}`)
      loadVersions()
    } catch (err) {
      message.error(err?.message || '回滚失败')
    }
  }

  async function handleDeleteVersion(versionId) {
    try {
      await deleteVersion(projectId, versionId)
      setVersions(prev => prev.filter(v => v.id !== versionId))
      message.success('版本已删除')
    } catch (err) {
      message.error(err?.message || '删除失败')
    }
  }

  // ── 成员管理 ────────────────────────────────────────────────
  const [members, setMembers]     = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [showInvite, setShowInvite]         = useState(false)
  const [inviteEmail, setInviteEmail]       = useState('')
  const [inviteRole, setInviteRole]         = useState('editor')

  const loadMembers = useCallback(async () => {
    if (!projectId) return
    setMembersLoading(true)
    try {
      const data = await listMembers(projectId)
      setMembers(data.list || [])
    } catch (err) {
      message.error(err?.message || '成员列表加载失败')
    } finally {
      setMembersLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadMembers() }, [loadMembers])

  async function handleInvite() {
    if (!inviteEmail.trim()) { message.error('请输入邮箱'); return }
    try {
      await inviteMember(projectId, { email: inviteEmail, role: inviteRole })
      setInviteEmail('')
      setShowInvite(false)
      message.success(`已发送邀请至 ${inviteEmail}`)
      loadMembers()
    } catch (err) {
      message.error(err?.message || '邀请失败')
    }
  }

  async function handleRoleChange(memberId, newRole) {
    try {
      await updateMemberRole(projectId, memberId, { role: newRole })
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } catch (err) {
      message.error(err?.message || '角色更新失败')
    }
  }

  async function handleRemoveMember(memberId) {
    if (memberId === user?.id) { message.warning('不能移除自己'); return }
    try {
      await removeMember(projectId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
      message.success('已移除成员')
    } catch (err) {
      message.error(err?.message || '移除失败')
    }
  }

  // ── 导出 ────────────────────────────────────────────────────
  async function handleExport(format) {
    if (format === 'json') {
      try {
        const blob = isKg
          ? await exportKnowledgeGraph(projectId)
          : await exportFaultTree(projectId)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${projectName}.json`
        a.click()
        URL.revokeObjectURL(url)
        message.success('已导出 JSON')
      } catch (err) {
        message.error(err?.message || '导出失败')
      }
      return
    }

    // SVG / PNG: fetch graph data then render locally
    try {
      // Reuse the version snapshot from the latest version as source of truth,
      // or fall back to re-fetching via the export API
      const blob = isKg
        ? await exportKnowledgeGraph(projectId)
        : await exportFaultTree(projectId)
      const text = await blob.text()
      const data = JSON.parse(text)

      let svgString
      if (isKg) {
        svgString = buildKgSVG(data.rfNodes ?? data.nodes ?? [], data.rfEdges ?? data.edges ?? [])
      } else {
        svgString = buildFaultTreeSVG(data.nodes ?? [], data.edges ?? [])
      }

      if (!svgString) { message.warning('暂无图数据，无法导出'); return }

      if (format === 'svg') {
        downloadSvg(svgString, `${projectName}.svg`)
        message.success('已导出 SVG 文件')
      } else {
        downloadSvgAsPng(svgString, `${projectName}.png`)
        message.success('PNG 导出中...')
      }
    } catch (err) {
      message.error(err?.message || '导出失败')
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
              onClick={() => navigate(-1)}
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
              <Spin spinning={versionsLoading}>
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
              </Spin>
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
              <Spin spinning={membersLoading}>
                <div className="space-y-3">
                  {members.map(m => {
                    const cfg = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.viewer
                    return (
                      <div key={m.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar
                            size={32}
                            style={{ background: avatarColor(m.name || m.username || m.email), flexShrink: 0 }}
                          >
                            {initials(m.name || m.username || m.email || '?')}
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-gray-700 leading-none">
                              {m.name || m.username || m.email}
                            </p>
                            <Select
                              value={m.role}
                              size="small"
                              style={{ width: 90, marginTop: 2 }}
                              onChange={role => handleRoleChange(m.id, role)}
                              disabled={m.id === user?.id}
                              options={Object.entries(ROLE_CONFIG).map(([v, c]) => ({
                                value: v, label: c.label,
                              }))}
                            />
                          </div>
                        </div>
                        {m.id !== user?.id && (
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
                  {!membersLoading && members.length === 0 && (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" />
                  )}
                </div>
              </Spin>

              <Divider style={{ margin: '12px 0 8px' }} />
              <div className="text-xs text-gray-400 space-y-1">
                <p>• <strong>管理员</strong>：编辑、邀请、删除成员</p>
                <p>• <strong>编辑者</strong>：编辑图谱内容</p>
                <p>• <strong>查看者</strong>：只读浏览</p>
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
      </Modal>
    </div>
  )
}

