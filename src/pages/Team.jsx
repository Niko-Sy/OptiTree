/**
 * Team — 团队协作总览页面
 * 路由：/team
 * 功能：跨项目协作成员汇总、版本动态时间线、快速跳转协作管理
 * 数据：从后端聚合（listProjects + listMembers + listVersions）
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Card, Tag, Avatar, Tooltip, Empty, Badge,
  Statistic, Row, Col, Input, Tabs, Timeline, Typography,
  Divider, Spin,
} from 'antd'
import {
  ArrowLeftOutlined, TeamOutlined, ApartmentOutlined,
  ApiOutlined, ClockCircleOutlined, SearchOutlined,
  UserAddOutlined, RightOutlined, HistoryOutlined,
  ProjectOutlined, NodeIndexOutlined,
} from '@ant-design/icons'
import { useAuth } from '../store/useAuthStore'
import UserAvatar from '../components/common/UserAvatar'
import { listProjects } from '../services/projectService'
import { listMembers, listVersions } from '../services/collaborationService'

const { Text, Title } = Typography

// ─── 头像颜色（与其他页面保持一致）─────────────────────────────
const AVATAR_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2']
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

const ROLE_LABEL = { admin: '管理员', editor: '编辑者', viewer: '查看者' }
const ROLE_COLOR = { admin: 'red', editor: 'blue', viewer: 'default' }

export default function Team() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('projects')
  const [loading, setLoading] = useState(false)
  const [enriched, setEnriched] = useState([])   // { ...project, members:[], versions:[] }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // 同时拉取故障树项目和知识图谱项目
        const [ftData, kgData] = await Promise.all([
          listProjects({ type: 'ft', pageSize: 100 }),
          listProjects({ type: 'kg', pageSize: 100 }),
        ])
        const allProjects = [
          ...(ftData.list || []).map(p => ({ ...p, projectType: 'ft' })),
          ...(kgData.list || []).map(p => ({ ...p, projectType: 'kg' })),
        ]
        if (cancelled) return

        // 并行为每个项目加载成员和版本（静默处理失败）
        const enrichedList = await Promise.all(
          allProjects.map(async p => {
            const [membersData, versionsData] = await Promise.allSettled([
              listMembers(p.id),
              listVersions(p.id),
            ])
            return {
              ...p,
              members: membersData.status === 'fulfilled' ? (membersData.value?.list || []) : [],
              versions: versionsData.status === 'fulfilled' ? (versionsData.value?.list || []) : [],
            }
          })
        )
        if (!cancelled) setEnriched(enrichedList)
      } catch {
        // 静默，子列表仍可继续渲染
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── 搜索过滤 ────────────────────────────────────────────────
  const filtered = useMemo(() =>
    enriched.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())),
  [enriched, search])

  // ── 统计数据 ────────────────────────────────────────────────
  const totalMembers = useMemo(() => {
    const ids = new Set()
    enriched.forEach(p => p.members.forEach(m => ids.add(m.id || m.userId)))
    return ids.size
  }, [enriched])

  const totalVersions = useMemo(() =>
    enriched.reduce((s, p) => s + p.versions.length, 0),
  [enriched])

  // ── 全局版本动态（最近 20 条，时间倒序）─────────────────────
  const recentVersions = useMemo(() => {
    const all = []
    enriched.forEach(p => {
      p.versions.forEach(v => {
        all.push({ ...v, projectId: p.id, projectName: p.name, projectType: p.projectType })
      })
    })
    return all
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
  }, [enriched])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* 顶部栏 */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)} />
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <TeamOutlined style={{ color: '#1677ff', fontSize: 16 }} />
            </div>
            <span className="font-semibold text-gray-900 text-base">团队协作总览</span>
          </div>
          <UserAvatar size={32} />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">

        {/* 统计卡片 */}
        <Spin spinning={loading}>
        <Row gutter={16} className="mb-8">
          <Col span={8}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">协作项目</span>}
                value={enriched.length}
                prefix={<ProjectOutlined className="text-blue-500" />}
                styles={{ content: { color: '#1677ff', fontSize: 28 } }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">团队成员（去重）</span>}
                value={totalMembers}
                prefix={<TeamOutlined className="text-green-500" />}
                styles={{ content: { color: '#52c41a', fontSize: 28 } }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">版本快照总数</span>}
                value={totalVersions}
                prefix={<HistoryOutlined className="text-purple-500" />}
                styles={{ content: { color: '#722ed1', fontSize: 28 } }}
              />
            </div>
          </Col>
        </Row>
        </Spin>

        {/* 列表区域 */}
        <div className="flex items-center justify-between mb-4">
          <Title level={5} className="mb-0! text-gray-800">项目协作管理</Title>
          <Input
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="搜索项目名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
        </div>

        <Divider style={{ margin: '0 0 0' }} />

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'projects',
              label: <span><TeamOutlined className="mr-1" />项目列表</span>,
              children: (
                <ProjectList
                  items={filtered}
                  totalCount={enriched.length}
                  loading={loading}
                  search={search}
                  onNavigate={navigate}
                />
              ),
            },
            {
              key: 'activity',
              label: (
                <span>
                  <HistoryOutlined className="mr-1" />版本动态
                  {totalVersions > 0 && (
                    <Badge count={totalVersions} size="small" className="ml-1" overflowCount={99} />
                  )}
                </span>
              ),
              children: <ActivityFeed versions={recentVersions} onNavigate={navigate} />,
            },
          ]}
        />
      </main>

      <footer className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
        OptiTree 团队协作中心
      </footer>
    </div>
  )
}

// ─── 项目列表面板 ────────────────────────────────────────────────
function ProjectList({ items, totalCount, loading, search, onNavigate }) {
  if (loading) {
    return <div className="py-16 text-center"><Spin /></div>
  }

  if (totalCount === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 py-16 mt-4">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div className="text-center">
              <p className="text-gray-500 mb-3">还没有项目，先去仪表盘新建一个吧</p>
              <Button type="primary" onClick={() => onNavigate('/dashboard')}>
                前往仪表盘
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 py-10 mt-4 text-center">
        <Text className="text-gray-400">未找到与 "{search}" 匹配的项目</Text>
      </div>
    )
  }

  return (
    <div className="space-y-3 pt-4">
      {items.map(p => (
        <ProjectRow key={p.id} project={p} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

// ─── 单个项目行 ──────────────────────────────────────────────────
function ProjectRow({ project, onNavigate }) {
  const isKg = project.projectType === 'kg'
  const iconBg    = isKg ? 'bg-purple-50' : 'bg-blue-50'
  const iconColor = isKg ? '#722ed1' : '#1677ff'

  const date = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  const latestVer = project.versions?.[0]

  return (
    <Card
      className="hover:shadow-md transition-shadow"
      styles={{ body: { padding: '14px 20px' } }}
    >
      <div className="flex items-center gap-4">

        {/* 类型图标 */}
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {isKg
            ? <ApiOutlined style={{ fontSize: 18, color: iconColor }} />
            : <ApartmentOutlined style={{ fontSize: 18, color: iconColor }} />
          }
        </div>

        {/* 基本信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">{project.name}</span>
            <Tag color={isKg ? 'purple' : 'blue'} className="text-xs">
              {isKg ? '知识图谱' : '故障树'}
            </Tag>
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <ClockCircleOutlined /> {date}
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <HistoryOutlined /> {(project.versions || []).length} 个版本
              {latestVer && (
                <span className="text-gray-300 ml-1">
                  · 最近 {new Date(latestVer.createdAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* 成员头像组 */}
        <div className="flex items-center gap-2 shrink-0">
          <Avatar.Group maxCount={4} size={28}>
            {(project.members || []).map(m => {
              const displayName = m.name || m.displayName || m.username || m.email || '?'
              return (
                <Tooltip key={m.id || m.userId} title={`${displayName}（${ROLE_LABEL[m.role] ?? m.role}）`}>
                  <Avatar
                    size={28}
                    style={{ background: avatarColor(displayName), fontSize: 11, fontWeight: 600 }}
                  >
                    {initials(displayName)}
                  </Avatar>
                </Tooltip>
              )
            })}
          </Avatar.Group>
          <Tag color={ROLE_COLOR[project.members?.[0]?.role] ?? 'default'} className="text-xs">
            {(project.members || []).length} 人
          </Tag>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="small"
            icon={<NodeIndexOutlined />}
            onClick={() => onNavigate(isKg ? `/knowledge?id=${project.id}` : `/editor?id=${project.id}`)}
          >
            编辑
          </Button>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => onNavigate(`/collaboration?id=${project.id}&type=${isKg ? 'kg' : 'ft'}`)}
          >
            协作管理
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ─── 版本动态面板 ────────────────────────────────────────────────
function ActivityFeed({ versions, onNavigate }) {
  if (versions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 py-16 mt-4">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无版本记录。在编辑器中点击「另存版本」来创建快照。"
        />
      </div>
    )
  }

  return (
    <Card className="mt-4 shadow-sm">
      <Timeline
        items={versions.map((v, i) => ({
          dot: i === 0
            ? <Badge dot status="processing"><HistoryOutlined style={{ fontSize: 12 }} /></Badge>
            : <HistoryOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />,
          children: (
            <div className="flex items-start justify-between pb-1">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800 text-sm">{v.label}</span>
                  {i === 0 && <Tag color="green" className="text-xs">最新</Tag>}
                  <Tag
                    color={v.projectType === 'kg' ? 'purple' : 'blue'}
                    className="text-xs cursor-pointer"
                    onClick={() => onNavigate(`/collaboration?id=${v.projectId}&type=${v.projectType}`)}
                  >
                    {v.projectName}
                    <RightOutlined className="ml-1" style={{ fontSize: 9 }} />
                  </Tag>
                </div>
                <Text className="text-xs text-gray-400">
                  {new Date(v.createdAt).toLocaleString('zh-CN')}
                </Text>
              </div>
            </div>
          ),
        }))}
      />
    </Card>
  )
}
