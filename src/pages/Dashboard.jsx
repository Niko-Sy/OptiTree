// 仪表盘页面，显示项目统计信息、项目列表和新建项目功能
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Empty, Statistic, Row, Col, Divider, Dropdown, Tabs, message, Spin } from 'antd'
import {
  PlusOutlined, SearchOutlined, ApartmentOutlined,
  ProjectOutlined, FundOutlined, ApiOutlined,
  UploadOutlined, ThunderboltOutlined, DownOutlined,
} from '@ant-design/icons'
import ProjectCard from '../components/dashboard/ProjectCard'
import NewProjectModal from '../components/dashboard/NewProjectModal'
import NewKnowledgeGraphModal from '../components/dashboard/NewKnowledgeGraphModal'
import DocumentUploadModal from '../components/dashboard/DocumentUploadModal'
import UserAvatar from '../components/common/UserAvatar'
import {
  getDashboardSummary, listProjects, createProject, deleteProject,
} from '../services/projectService'
import { importFaultTree } from '../services/faultTreeService'
import { createTaskWsManager } from '../services/wsTaskService'
import { tokenStore } from '../services/apiClient'
import { generateFaultTree, generateKnowledgeGraph } from '../services/aiService'

const TASK_META_STORAGE_KEY = 'optitree_ai_task_meta'

function loadTaskMetaCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_META_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// ─── Template preset graphs ───────────────────────────────────────
const TEMPLATES = {
  power: {
    nodes: [
      { id: 'root',   type: 'topEvent',   name: '电源系统失效',   x: 0, y: 0, width: 140, height: 60 },
      { id: 'gate1',  type: 'gate',       name: 'OR',            gateType: 'OR', x: 0, y: 0, width: 80, height: 64 },
      { id: 'mid1',   type: 'midEvent',   name: '主供电故障',     x: 0, y: 0, width: 120, height: 56 },
      { id: 'mid2',   type: 'midEvent',   name: '备用电源故障',   x: 0, y: 0, width: 120, height: 56 },
      { id: 'gate2',  type: 'gate',       name: 'AND',           gateType: 'AND', x: 0, y: 0, width: 80, height: 64 },
      { id: 'b1',     type: 'basicEvent', name: '电池耗尽',       probability: 0.02, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b2',     type: 'basicEvent', name: '线路短路',       probability: 0.005, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b3',     type: 'basicEvent', name: '变压器故障',     probability: 0.01, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b4',     type: 'basicEvent', name: '充电器失效',     probability: 0.008, x: 0, y: 0, width: 110, height: 56 },
    ],
    edges: [
      { id: 'e1', from: 'root',  to: 'gate1' },
      { id: 'e2', from: 'gate1', to: 'mid1' },
      { id: 'e3', from: 'gate1', to: 'mid2' },
      { id: 'e4', from: 'mid1',  to: 'gate2' },
      { id: 'e5', from: 'gate2', to: 'b1' },
      { id: 'e6', from: 'gate2', to: 'b2' },
      { id: 'e7', from: 'mid2',  to: 'b3' },
      { id: 'e8', from: 'mid2',  to: 'b4' },
    ],
    tags: ['电源', '硬件'],
  },
  software: {
    nodes: [
      { id: 'root',  type: 'topEvent',   name: '软件系统崩溃',     x: 0, y: 0, width: 140, height: 60 },
      { id: 'gate1', type: 'gate',       name: 'OR',              gateType: 'OR', x: 0, y: 0, width: 80, height: 64 },
      { id: 'mid1',  type: 'midEvent',   name: '内存溢出',         x: 0, y: 0, width: 120, height: 56 },
      { id: 'mid2',  type: 'midEvent',   name: '进程死锁',         x: 0, y: 0, width: 120, height: 56 },
      { id: 'gate2', type: 'gate',       name: 'AND',             gateType: 'AND', x: 0, y: 0, width: 80, height: 64 },
      { id: 'b1',    type: 'basicEvent', name: '内存泄漏',         probability: 0.03, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b2',    type: 'basicEvent', name: '大数据量输入',     probability: 0.05, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b3',    type: 'basicEvent', name: '资源竞争',         probability: 0.02, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b4',    type: 'basicEvent', name: '锁未释放',         probability: 0.01, x: 0, y: 0, width: 110, height: 56 },
    ],
    edges: [
      { id: 'e1', from: 'root',  to: 'gate1' },
      { id: 'e2', from: 'gate1', to: 'mid1' },
      { id: 'e3', from: 'gate1', to: 'mid2' },
      { id: 'e4', from: 'mid1',  to: 'gate2' },
      { id: 'e5', from: 'gate2', to: 'b1' },
      { id: 'e6', from: 'gate2', to: 'b2' },
      { id: 'e7', from: 'mid2',  to: 'b3' },
      { id: 'e8', from: 'mid2',  to: 'b4' },
    ],
    tags: ['软件', '进程'],
  },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [kgList, setKgList] = useState([])
  const [summary, setSummary] = useState({})
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('ft')
  const [showModal, setShowModal] = useState(false)
  const [showKgModal, setShowKgModal] = useState(false)
  const [docUploadTarget, setDocUploadTarget] = useState(null) // 'faultTree' | 'knowledge' | null
  const [taskMetaByProject, setTaskMetaByProject] = useState(loadTaskMetaCache)
  const [progressByProject, setProgressByProject] = useState({})
  const [retryingProjectId, setRetryingProjectId] = useState('')
  const wsManagersRef = useRef({})

  useEffect(() => {
    localStorage.setItem(TASK_META_STORAGE_KEY, JSON.stringify(taskMetaByProject))
  }, [taskMetaByProject])

  // ─── 从 API 加载数据 ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setListLoading(true)
    try {
      const [summaryData, ftData, kgData] = await Promise.all([
        getDashboardSummary(),
        listProjects({ type: 'ft', pageSize: 100 }),
        listProjects({ type: 'kg', pageSize: 100 }),
      ])
      setSummary(summaryData)
      setProjects(ftData.list || [])
      setKgList(kgData.list || [])
    } catch (err) {
      message.error(err?.message || '加载失败，请刷新重试')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── 创建故障树项目 ───────────────────────────────────────────
  async function handleCreateProject({ name, template, description, tags }) {
    try {
      const tpl = TEMPLATES[template]
      const data = await createProject({
        name,
        type: 'ft',
        description: description || '',
        // 用户手动填入的标签优先；无标签时使用模板预设标签
        tags: tags?.length ? tags : (tpl ? tpl.tags : []),
      })
      const { project } = data
      // 若有模板则导入图数据
      if (tpl) {
        await importFaultTree({ projectId: project.id, nodes: tpl.nodes, edges: tpl.edges })
      }
      setShowModal(false)
      navigate(`/editor?id=${project.id}`)
    } catch (err) {
      message.error(err?.message || '创建失败')
    }
  }

  // ─── 创建空白知识图谱 ─────────────────────────────────────────
  async function handleCreateKg({ name, description, tags }) {
    try {
      const data = await createProject({ name, type: 'kg', description: description || '', tags: tags || [] })
      const { project } = data
      setShowKgModal(false)
      navigate(`/knowledge?id=${project.id}`)
    } catch (err) {
      message.error(err?.message || '创建失败')
    }
  }

  // ─── 文档上传完成后（AI 生成，仍为 mock）────────────────────
  function updateProjectProgress(projectId, payload) {
    setProgressByProject(prev => ({
      ...prev,
      [projectId]: {
        progress: payload.progress ?? prev[projectId]?.progress ?? 0,
        stageLabel: payload.stageLabel ?? prev[projectId]?.stageLabel,
      },
    }))
  }

  const bindTaskWs = useCallback((projectId, taskId) => {
    if (!projectId) return
    if (wsManagersRef.current[projectId]) {
      wsManagersRef.current[projectId].updateTask(taskId)
      return
    }

    const ws = createTaskWsManager({
      projectId,
      taskId,
      token: tokenStore.getAccess(),
      onEvent: (event) => {
        if (!event) return
        if (event.event === 'task.pending' || event.event === 'task.progress') {
          updateProjectProgress(projectId, event)
          // 仅在 taskId 实际变化时更新，避免每次进度事件都触发 taskMetaByProject 状态更新
          if (event.taskId) {
            setTaskMetaByProject(prev => {
              if (prev[projectId]?.taskId === event.taskId) return prev
              return {
                ...prev,
                [projectId]: {
                  ...prev[projectId],
                  taskId: event.taskId,
                  projectId,
                },
              }
            })
          }
        }
        if (event.event === 'task.completed') {
          updateProjectProgress(projectId, { progress: 100, stageLabel: '已完成' })
          setTaskMetaByProject(prev => {
            const next = { ...prev }
            delete next[projectId]
            return next
          })
          loadData()
          ws.disconnect()
          delete wsManagersRef.current[projectId]
        }
        if (event.event === 'task.failed' || event.event === 'task.cancelled') {
          loadData()
          ws.disconnect()
          delete wsManagersRef.current[projectId]
        }
      },
    })

    wsManagersRef.current[projectId] = ws
    ws.connect()
  }, [loadData])

  async function handleDocUploadComplete(result) {
    setDocUploadTarget(null)
    try {
      if (result?.projectId && result?.taskId) {
        setTaskMetaByProject(prev => ({
          ...prev,
          [result.projectId]: {
            projectId: result.projectId,
            taskId: result.taskId,
            target: result.target,
            retryPayload: result.retryPayload,
            updatedAt: Date.now(),
          },
        }))
        updateProjectProgress(result.projectId, { progress: 1, stageLabel: '任务已创建' })
        await loadData()
        bindTaskWs(result.projectId, result.taskId)
        message.success('已创建 AI 生成任务，项目卡片将实时更新进度')
      }
    } catch (err) {
      message.error(err?.message || '导入失败')
    }
  }

  async function handleRetryGenerate(project) {
    const meta = taskMetaByProject[project.id]
    const payload = meta?.retryPayload
    if (!payload) {
      message.warning('缺少重试参数，请重新上传文档发起生成')
      return
    }

    setRetryingProjectId(project.id)
    try {
      let data
      if (payload.type === 'kg') {
        data = await generateKnowledgeGraph(payload.docIds, payload.config, project.id)
      } else {
        data = await generateFaultTree(payload.docIds, payload.topEvent, payload.config, project.id)
      }

      setTaskMetaByProject(prev => ({
        ...prev,
        [project.id]: {
          ...prev[project.id],
          projectId: project.id,
          taskId: data.taskId,
          updatedAt: Date.now(),
        },
      }))
      updateProjectProgress(project.id, { progress: 1, stageLabel: '重试任务已创建' })
      bindTaskWs(project.id, data.taskId)
      await loadData()
      message.success('已重新发起生成任务')
    } catch (err) {
      message.error(err?.message || '重试失败')
    } finally {
      setRetryingProjectId('')
    }
  }

  useEffect(() => {
    const allProjects = [...projects, ...kgList]
    const activeProjects = new Set(allProjects.map((project) => project.id))

    // 移除不存在项目的历史任务缓存
    setTaskMetaByProject(prev => {
      const next = {}
      let changed = false
      Object.entries(prev).forEach(([projectId, meta]) => {
        if (!activeProjects.has(projectId)) {
          changed = true
          return
        }
        next[projectId] = meta
      })
      return changed ? next : prev
    })

    allProjects.forEach((project) => {
      if (!['pending_generating', 'generating'].includes(project.generation_status)) return
      bindTaskWs(project.id, taskMetaByProject[project.id]?.taskId)
    })
  }, [projects, kgList, taskMetaByProject, bindTaskWs])

  useEffect(() => () => {
    Object.values(wsManagersRef.current).forEach((ws) => ws.disconnect())
    wsManagersRef.current = {}
  }, [])

  // ─── 删除 ──────────────────────────────────────────────────────
  async function handleDeleteProject(id) {
    try {
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      setSummary(prev => ({ ...prev, faultTreeProjectCount: (prev.faultTreeProjectCount || 1) - 1 }))
    } catch (err) {
      message.error(err?.message || '删除失败')
    }
  }

  async function handleDeleteKg(id) {
    try {
      await deleteProject(id)
      setKgList(prev => prev.filter(k => k.id !== id))
      setSummary(prev => ({ ...prev, knowledgeProjectCount: (prev.knowledgeProjectCount || 1) - 1 }))
    } catch (err) {
      message.error(err?.message || '删除失败')
    }
  }

  // ─── Dropdown 菜单项 ──────────────────────────────────────────
  const newMenuItems = [
    {
      key: 'ft',
      icon: <ApartmentOutlined />,
      label: '新建空白故障树',
      onClick: () => setShowModal(true),
    },
    {
      key: 'doc-ft',
      icon: <UploadOutlined />,
      label: 'AI识别文档 → 故障树（Beta）',
      onClick: () => { setDocUploadTarget('faultTree'); setActiveTab('ft') },
    },
    { type: 'divider' },
    {
      key: 'kg',
      icon: <ApiOutlined />,
      label: '新建空白知识图谱',
      onClick: () => setShowKgModal(true),
    },
    {
      key: 'doc-kg',
      icon: <ThunderboltOutlined />,
      label: 'AI识别文档 → 知识图谱（Beta）',
      onClick: () => { setDocUploadTarget('knowledge'); setActiveTab('kg') },
    },
  ]

  // ─── 当前 tab 的过滤数据 ──────────────────────────────────────
  const ftFiltered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const kgFiltered = kgList.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="24.000000pt" height="24.000000pt" viewBox="0 0 726.000000 726.000000" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,726.000000) scale(0.100000,-0.100000)" fill="#ffffff" stroke="none"><path d="M3468 6090 c-132 -24 -269 -91 -385 -189 -109 -94 -153 -156 -234 -336 -36 -81 -50 -253 -29 -378 12 -75 66 -205 118 -287 l41 -65 -72 -65 c-40 -36 -122 -112 -182 -170 -61 -58 -162 -152 -225 -210 -150 -138 -252 -233 -505 -476 -116 -110 -240 -227 -276 -260 -90 -81 -293 -271 -543 -510 -116 -110 -247 -233 -291 -274 -44 -40 -118 -110 -165 -154 -137 -130 -201 -188 -269 -246 -86 -74 -283 -247 -349 -307 l-52 -48 -3 -370 c-2 -426 -8 -398 96 -477 150 -113 606 -398 636 -398 18 0 102 37 111 48 6 8 32 25 205 135 249 158 402 265 420 295 11 19 17 580 8 705 l-6 77 -91 72 c-50 40 -134 106 -186 147 -182 143 -210 166 -210 172 0 3 21 21 47 40 26 18 104 88 173 154 69 66 182 172 250 235 69 63 148 138 176 167 l51 54 89 -89 c125 -123 510 -490 562 -533 40 -34 54 -59 32 -59 -22 0 -425 -323 -461 -368 -19 -25 -20 -40 -17 -398 l3 -373 30 -32 c29 -30 203 -148 465 -316 190 -121 197 -124 242 -126 38 -2 57 7 151 68 59 39 122 79 140 89 81 49 375 249 404 275 17 16 36 38 42 49 12 23 16 675 5 731 -4 18 -20 45 -36 61 -33 33 -248 208 -358 292 -41 32 -89 70 -105 85 -96 88 -205 191 -320 303 -155 150 -452 430 -550 517 -66 60 -69 64 -51 78 26 20 192 172 306 280 178 168 725 681 795 745 39 35 89 84 112 109 l42 45 38 -18 c88 -42 158 -58 284 -63 140 -6 231 8 347 54 l64 25 97 -93 c169 -164 568 -536 705 -658 39 -35 118 -109 176 -165 58 -56 149 -143 203 -192 l99 -91 -144 -133 c-317 -296 -408 -381 -551 -518 -135 -129 -324 -296 -592 -522 -55 -47 -108 -94 -117 -105 -16 -18 -17 -54 -18 -376 0 -227 4 -367 11 -385 13 -38 76 -88 294 -235 269 -182 398 -259 432 -259 33 0 243 122 403 235 36 25 103 71 150 102 114 76 159 113 176 145 11 22 14 99 14 388 0 216 -4 369 -10 380 -11 20 -99 95 -315 264 -82 65 -150 121 -150 126 0 12 404 400 501 481 47 39 102 93 122 120 20 26 42 48 47 48 6 1 51 -40 100 -90 50 -50 126 -123 170 -162 44 -39 139 -125 210 -193 72 -67 151 -139 177 -160 26 -22 47 -42 47 -45 1 -3 -7 -10 -18 -15 -10 -5 -40 -28 -67 -51 -27 -23 -95 -77 -150 -120 -56 -43 -136 -106 -178 -141 l-76 -62 0 -379 c0 -439 -12 -392 122 -488 187 -132 450 -305 537 -353 90 -50 71 -57 426 171 238 153 332 222 362 268 23 34 23 36 23 402 l0 369 -42 42 c-24 24 -128 115 -233 203 -104 88 -230 198 -280 245 -49 47 -117 110 -150 140 -33 30 -100 93 -150 140 -109 103 -210 197 -290 269 -33 29 -105 97 -160 150 -55 53 -156 148 -225 211 -69 63 -170 158 -225 211 -55 53 -135 127 -177 165 -42 38 -141 129 -220 203 -79 74 -177 166 -218 204 -41 39 -129 122 -195 186 -66 64 -167 159 -225 211 -57 52 -116 106 -131 119 l-27 25 28 35 c40 51 96 165 115 236 9 33 19 106 22 161 11 200 -39 357 -170 529 -67 88 -159 163 -264 214 -144 71 -193 83 -338 87 -71 1 -151 -1 -177 -6z m210 -340 c237 -34 411 -249 387 -479 -14 -148 -78 -248 -210 -330 -128 -80 -294 -92 -423 -30 -58 29 -144 100 -186 155 -100 130 -99 355 0 497 52 73 158 148 249 175 81 24 98 25 183 12z m972 -3550 c213 -151 319 -238 326 -265 3 -12 2 -112 -3 -221 l-8 -197 -69 -53 c-87 -67 -285 -184 -310 -184 -34 0 -317 172 -369 224 l-27 27 2 216 3 217 148 111 c81 61 164 128 184 148 20 20 41 33 47 29 6 -3 40 -27 76 -52z m1841 44 c7 -9 76 -63 154 -121 77 -58 157 -121 178 -141 l37 -36 0 -212 0 -213 -42 -34 c-24 -18 -88 -63 -143 -98 -193 -125 -187 -123 -258 -88 -75 38 -287 173 -318 203 l-29 28 0 208 0 208 158 120 c86 66 175 136 197 156 46 41 48 41 66 20z m-5551 -109 c85 -64 176 -132 201 -151 l47 -34 -1 -208 c0 -176 -2 -210 -16 -225 -20 -23 -261 -187 -318 -216 -23 -11 -53 -21 -66 -21 -24 0 -218 111 -311 177 -88 63 -84 48 -82 292 l1 215 85 65 c47 35 128 99 180 142 52 43 102 78 110 78 8 1 85 -51 170 -114z m1803 72 c29 -24 106 -85 172 -134 66 -50 128 -100 138 -111 17 -18 19 -42 20 -227 l2 -207 -40 -34 c-22 -18 -64 -48 -93 -66 -29 -18 -93 -59 -142 -90 -53 -35 -99 -58 -116 -58 -30 0 -146 64 -274 151 -143 97 -130 67 -130 307 0 152 3 212 13 224 6 8 34 30 60 48 27 17 109 79 184 136 74 57 139 104 145 104 5 0 33 -20 61 -43z"/></g></svg>
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">OptiTree</span>
            <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">故障树可视化系统</span>
          </div>
          <div className="flex items-center gap-3">
            <Dropdown menu={{ items: newMenuItems }} trigger={['click']}>
              <Button type="primary" icon={<PlusOutlined />}>
                新建 <DownOutlined className="text-xs" />
              </Button>
            </Dropdown>
            <UserAvatar size={34} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Stats */}
        <Spin spinning={listLoading}>
        <Row gutter={16} className="mb-8">
          <Col span={6}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">故障树项目</span>}
                value={summary.faultTreeProjectCount ?? projects.length}
                prefix={<ProjectOutlined className="text-blue-500" />}
                styles={{ content: { color: '#1677ff', fontSize: 28 } }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">节点总数</span>}
                value={summary.faultTreeNodeCount ?? 0}
                prefix={<ApartmentOutlined className="text-green-500" />}
                styles={{ content: { color: '#52c41a', fontSize: 28 } }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">知识图谱</span>}
                value={summary.knowledgeProjectCount ?? kgList.length}
                prefix={<ApiOutlined className="text-purple-500" />}
                styles={{ content: { color: '#722ed1', fontSize: 28 } }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">实体总数</span>}
                value={summary.knowledgeEntityCount ?? 0}
                prefix={<FundOutlined className="text-orange-400" />}
                styles={{ content: { color: '#fa8c16', fontSize: 28 } }}
              />
            </div>
          </Col>
        </Row>
        </Spin>

        {/* Project List Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">我的工作区</h2>
          <Input
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="搜索名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
        </div>

        <Divider style={{ margin: '0 0 0' }} />

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'ft',
              label: <span><ApartmentOutlined className="mr-1" />故障树（{projects.length}）</span>,
              children: (
                <ProjectGrid
                  items={ftFiltered}
                  progressByProject={progressByProject}
                  retryingProjectId={retryingProjectId}
                  search={search}
                  onDelete={handleDeleteProject}
                  onRetry={handleRetryGenerate}
                  onNew={() => setShowModal(true)}
                  emptyText="还没有故障树项目"
                  newLabel="新建故障树"
                />
              ),
            },
            {
              key: 'kg',
              label: <span><ApiOutlined className="mr-1" />知识图谱（{kgList.length}）</span>,
              children: (
                <ProjectGrid
                  items={kgFiltered}
                  progressByProject={progressByProject}
                  retryingProjectId={retryingProjectId}
                  search={search}
                  onDelete={handleDeleteKg}
                  onRetry={handleRetryGenerate}
                  onNew={() => setShowKgModal(true)}
                  emptyText="还没有知识图谱"
                  newLabel="新建知识图谱"
                  newColor="purple"
                />
              ),
            },
          ]}
        />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
        OptiTree 故障树可视化编辑系统 
      </footer>

      <NewProjectModal
        open={showModal}
        onConfirm={handleCreateProject}
        onCancel={() => setShowModal(false)}
      />
      <NewKnowledgeGraphModal
        open={showKgModal}
        onConfirm={handleCreateKg}
        onCancel={() => setShowKgModal(false)}
      />
      <DocumentUploadModal
        open={!!docUploadTarget}
        target={docUploadTarget}
        onComplete={handleDocUploadComplete}
        onCancel={() => setDocUploadTarget(null)}
      />
    </div>
  )
}

// ─── 通用项目网格组件 ─────────────────────────────────────────────
function ProjectGrid({ items, progressByProject, retryingProjectId, search, onDelete, onRetry, onNew, emptyText, newLabel, newColor = 'blue' }) {
  const hoverCls = newColor === 'purple'
    ? 'hover:border-purple-400 hover:bg-purple-50 hover:text-purple-500'
    : 'hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500'

  if (items.length > 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {items.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            onDelete={onDelete}
            taskProgress={progressByProject?.[p.id]?.progress}
            onRetry={onRetry}
            retryLoading={retryingProjectId === p.id}
          />
        ))}
        <div
          onClick={onNew}
          className={`border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center p-8 cursor-pointer transition-all text-gray-400 ${hoverCls}`}
        >
          <PlusOutlined style={{ fontSize: 28 }} />
          <p className="mt-2 text-sm font-medium">{newLabel}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 mt-4">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="text-center">
            <p className="text-gray-500 mb-3">
              {search ? `未找到与 "${search}" 匹配的内容` : emptyText}
            </p>
            {!search && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onNew}
                style={newColor === 'purple' ? { background: '#722ed1', borderColor: '#722ed1' } : {}}
              >
                {newLabel}
              </Button>
            )}
          </div>
        }
      />
    </div>
  )
}
