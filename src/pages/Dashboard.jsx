// 仪表盘页面，显示项目统计信息、项目列表和新建项目功能
import { useState, useEffect, useCallback, useRef, useMemo, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Empty, Statistic, Row, Col, Divider, Dropdown, Tabs, message, Spin, Skeleton, Tag } from 'antd'
import {
  PlusOutlined, SearchOutlined, ApartmentOutlined,
  ProjectOutlined, FundOutlined, ApiOutlined,
  UploadOutlined, ThunderboltOutlined, DownOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SyncOutlined,
} from '@ant-design/icons'
import ProjectCard from '../components/dashboard/ProjectCard'
import NewProjectModal from '../components/dashboard/NewProjectModal'
import NewKnowledgeGraphModal from '../components/dashboard/NewKnowledgeGraphModal'
import DocumentUploadModal from '../components/dashboard/DocumentUploadModal'
import UserAvatar from '../components/common/UserAvatar'
import {
  getDashboardSummary, listProjects, createProject, deleteProject,
} from '../services/projectService'
import { importFaultTree, getFaultTreeGraph } from '../services/faultTreeService'
import { getKnowledgeGraph } from '../services/knowledgeGraphService'
import { createTaskWsManager } from '../services/wsTaskService'
import { tokenStore } from '../services/apiClient'
import { generateFaultTree, generateKnowledgeGraph } from '../services/aiService'

const TASK_META_STORAGE_KEY = 'optitree_ai_task_meta'
const GENERATING_PROJECT_STATUSES = new Set(['pending_generating', 'generating'])
const ACTIVE_TASK_STATUSES = new Set(['pending', 'processing', 'retrying', 'queued', 'dispatching', 'accepted', 'parsing', 'producer_queued', 'waiting_project_slot', 'dispatch_retrying', 'enqueued', 'generating'])
const FAILED_TASK_STATUSES = new Set(['failed', 'dead', 'cancelled'])
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'dead', 'cancelled'])

function clampProgress(progress, fallback = 0) {
  const next = Number.isFinite(progress) ? progress : fallback
  return Math.max(0, Math.min(100, Math.round(next)))
}

function normalizeTaskType(type) {
  if (type === 'knowledge' || type === 'kg') return 'kg'
  return 'ft'
}

function toTimeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function toUpdatedMs(value) {
  if (!value) return 0
  const date = new Date(value)
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : 0
}

function getTaskBucket(status) {
  if (ACTIVE_TASK_STATUSES.has(status)) return 'active'
  if (status === 'completed') return 'completed'
  if (FAILED_TASK_STATUSES.has(status)) return 'failed'
  return 'other'
}

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
  const [taskRuntimeByProject, setTaskRuntimeByProject] = useState({})
  const [taskStatusFilter, setTaskStatusFilter] = useState('active')
  const [taskTypeFilter, setTaskTypeFilter] = useState('all')
  const [taskKeyword, setTaskKeyword] = useState('')
  const [focusedProjectId, setFocusedProjectId] = useState('')
  const [retryingProjectId, setRetryingProjectId] = useState('')
  const wsManagersRef = useRef({})
  const terminalNotifiedRef = useRef(new Set())

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

  const updateTaskRuntime = useCallback((projectId, payload = {}) => {
    if (!projectId) return
    setTaskRuntimeByProject(prev => {
      const before = prev[projectId] || {}
      const nextStatus = payload.status || before.status || 'processing'
      const fallbackProgress = nextStatus === 'completed' ? 100 : (before.progress ?? 0)
      const nextUpdatedAt = payload.updatedAt || before.updatedAt || new Date().toISOString()
      const nextStageLabel = payload.stageLabel || before.stageLabel || (nextStatus === 'completed' ? '生成完成' : '正在生成中...')
      const shouldAppendStage = Boolean(nextStageLabel)
        && nextStageLabel !== before.stageLabel
      const stageHistory = shouldAppendStage
        ? [...(before.stageHistory || []), { label: nextStageLabel, at: nextUpdatedAt, status: nextStatus }].slice(-6)
        : (before.stageHistory || [])
      const next = {
        ...before,
        ...payload,
        status: nextStatus,
        progress: clampProgress(payload.progress, fallbackProgress),
        projectStatus: payload.projectStatus || before.projectStatus || nextStatus,
        stageLabel: nextStageLabel,
        updatedAt: nextUpdatedAt,
        stageHistory,
      }
      return { ...prev, [projectId]: next }
    })
  }, [])

  const pushBrowserNotification = useCallback((title, body = '') => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (document.visibilityState === 'visible') return

    const show = () => {
      try {
        new Notification(title, { body, tag: 'optitree-ai-task' })
      } catch {
        // ignore notification errors in unsupported environments
      }
    }

    if (Notification.permission === 'granted') {
      show()
      return
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') show()
      }).catch(() => {
        // ignore permission errors
      })
    }
  }, [])

  const notifyTerminalOnce = useCallback((taskId, status, errorMessage) => {
    if (!taskId || terminalNotifiedRef.current.has(taskId)) return
    terminalNotifiedRef.current.add(taskId)

    if (status === 'completed') {
      message.success('AI 生成完成，项目现可进入编辑器')
      pushBrowserNotification('OptiTree AI 任务已完成', '项目已生成完成，可进入编辑器查看。')
      return
    }
    if (FAILED_TASK_STATUSES.has(status)) {
      message.error(errorMessage || 'AI 生成失败，请重试')
      pushBrowserNotification('OptiTree AI 任务失败', errorMessage || '任务生成失败，请返回仪表盘重试。')
    }
  }, [pushBrowserNotification])

  const prefetchGeneratedGraph = useCallback(async (projectId, taskType) => {
    if (!projectId) return
    if (normalizeTaskType(taskType) === 'kg') {
      await getKnowledgeGraph(projectId)
      return
    }
    await getFaultTreeGraph(projectId)
  }, [])

  const bindTaskWs = useCallback((projectId, taskId, taskType = 'ft') => {
    if (!projectId) return
    if (wsManagersRef.current[projectId]) {
      wsManagersRef.current[projectId].updateTask(taskId)
      wsManagersRef.current[projectId].updateTaskType(normalizeTaskType(taskType))
      return
    }

    const ws = createTaskWsManager({
      projectId,
      taskId,
      taskType: normalizeTaskType(taskType),
      token: tokenStore.getAccess(),
      onStateChange: (wsState, details = {}) => {
        const statePayload = { wsState }
        if (Number.isFinite(details.retryCount)) {
          statePayload.retryCount = details.retryCount
        }
        if (wsState === 'reconnecting' && Number.isFinite(details.delay)) {
          statePayload.stageLabel = `连接中断，${Math.max(1, Math.ceil(details.delay / 1000))} 秒后重试`
        }
        if (wsState === 'recovering') {
          statePayload.stageLabel = '正在执行断线兜底恢复...'
        }
        statePayload.updatedAt = new Date().toISOString()
        updateTaskRuntime(projectId, statePayload)
      },
      onEvent: (event) => {
        if (!event) return
        const eventName = event.event || ''
        const eventStatus = event.status || (eventName.startsWith('task.') ? eventName.slice(5) : '')

        if (event.taskId) {
          setTaskMetaByProject(prev => ({
            ...prev,
            [projectId]: {
              ...prev[projectId],
              projectId,
              taskId: event.taskId,
              taskType: normalizeTaskType(prev[projectId]?.taskType || taskType),
              status: eventStatus || prev[projectId]?.status,
              updatedAt: Date.now(),
            },
          }))
        }

        if (eventName === 'connected') {
          updateTaskRuntime(projectId, { wsState: 'connected' })
          return
        }

        if (eventName === 'task.pending' || eventName === 'task.snapshot' || eventName === 'task.progress' || eventName === 'task.retrying') {
          updateTaskRuntime(projectId, {
            taskId: event.taskId || taskId,
            status: eventStatus || 'processing',
            projectStatus: event.projectStatus,
            progress: event.progress,
            stage: event.stage,
            stageLabel: event.stageLabel,
            wsState: 'connected',
            errorMessage: '',
            updatedAt: event.updatedAt,
          })
          return
        }

        if (eventName === 'task.completed') {
          updateTaskRuntime(projectId, {
            taskId: event.taskId || taskId,
            status: 'completed',
            progress: 100,
            stage: event.stage || 'completed',
            stageLabel: event.stageLabel || '生成完成',
            wsState: 'connected',
            errorMessage: '',
            updatedAt: event.updatedAt,
          })
          notifyTerminalOnce(event.taskId || taskId, 'completed')
          setTaskMetaByProject(prev => {
            const next = { ...prev }
            delete next[projectId]
            return next
          })
          prefetchGeneratedGraph(projectId, taskType)
            .catch(() => {
              message.warning('任务已完成，图数据同步稍后重试')
            })
            .finally(() => {
              loadData()
            })
          ws.disconnect()
          delete wsManagersRef.current[projectId]
          return
        }

        if (eventName === 'task.failed' || eventName === 'task.dead' || eventName === 'task.cancelled') {
          const failedStatus = eventStatus || 'failed'
          updateTaskRuntime(projectId, {
            taskId: event.taskId || taskId,
            status: failedStatus,
            stage: event.stage || failedStatus,
            stageLabel: event.stageLabel || '生成失败',
            progress: event.progress,
            wsState: 'closed',
            errorMessage: event.errorMessage || '',
            updatedAt: event.updatedAt,
          })
          notifyTerminalOnce(event.taskId || taskId, failedStatus, event.errorMessage)
          setTaskMetaByProject(prev => ({
            ...prev,
            [projectId]: {
              ...prev[projectId],
              projectId,
              taskId: event.taskId || prev[projectId]?.taskId,
              taskType: normalizeTaskType(prev[projectId]?.taskType || taskType),
              status: failedStatus,
              updatedAt: Date.now(),
            },
          }))
          loadData()
          ws.disconnect()
          delete wsManagersRef.current[projectId]
        }
      },
    })

    wsManagersRef.current[projectId] = ws
    updateTaskRuntime(projectId, { wsState: 'connecting', taskId, status: taskId ? 'pending' : 'processing' })
    ws.connect()
  }, [loadData, notifyTerminalOnce, prefetchGeneratedGraph, updateTaskRuntime])

  async function handleDocUploadComplete(result) {
    setDocUploadTarget(null)
    try {
      if (result?.projectId && result?.taskId) {
        const taskType = normalizeTaskType(result.target)
        setTaskMetaByProject(prev => ({
          ...prev,
          [result.projectId]: {
            projectId: result.projectId,
            taskId: result.taskId,
            taskType,
            status: result.status || 'pending',
            target: result.target,
            retryPayload: result.retryPayload,
            updatedAt: Date.now(),
          },
        }))
        updateTaskRuntime(result.projectId, {
          taskId: result.taskId,
          status: result.status || 'pending',
          progress: 1,
          stageLabel: '任务已创建，等待调度...',
          wsState: 'connecting',
          updatedAt: new Date().toISOString(),
        })
        await loadData()
        bindTaskWs(result.projectId, result.taskId, taskType)
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
        data = await generateKnowledgeGraph(payload.docIds, project.id)
      } else {
        data = await generateFaultTree(payload.docIds, payload.topEvent, project.id, payload.userRequirements)
      }

      setTaskMetaByProject(prev => ({
        ...prev,
        [project.id]: {
          ...prev[project.id],
          projectId: project.id,
          taskId: data.taskId,
          taskType: payload.type,
          status: data.status || 'pending',
          updatedAt: Date.now(),
        },
      }))
      updateTaskRuntime(project.id, {
        taskId: data.taskId,
        status: data.status || 'pending',
        progress: 1,
        stageLabel: '重试任务已创建，等待调度...',
        wsState: 'connecting',
        errorMessage: '',
        updatedAt: new Date().toISOString(),
      })
      bindTaskWs(project.id, data.taskId, payload.type)
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
    const projectMap = new Map(allProjects.map((project) => [project.id, project]))

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

    setTaskRuntimeByProject(prev => {
      const next = {}
      let changed = false
      Object.entries(prev).forEach(([projectId, runtime]) => {
        if (!activeProjects.has(projectId)) {
          changed = true
          return
        }
        const project = projectMap.get(projectId)
        const meta = taskMetaByProject[projectId]
        const isProjectGenerating = GENERATING_PROJECT_STATUSES.has(project?.generation_status)
        const isRuntimeActive = ACTIVE_TASK_STATUSES.has(runtime?.status)
        const keepRuntime = Boolean(meta?.taskId) || isProjectGenerating || isRuntimeActive || FAILED_TASK_STATUSES.has(runtime?.status)
        if (!keepRuntime) {
          changed = true
          return
        }
        next[projectId] = runtime
      })
      return changed ? next : prev
    })

    allProjects.forEach((project) => {
      const meta = taskMetaByProject[project.id]
      const runtime = taskRuntimeByProject[project.id]
      const shouldTrack = Boolean(meta?.taskId)
        || GENERATING_PROJECT_STATUSES.has(project.generation_status)
        || (runtime?.wsState && !TERMINAL_TASK_STATUSES.has(runtime?.status))
      if (!shouldTrack) return

      const taskType = normalizeTaskType(meta?.taskType || project.type)
      const nextTaskId = meta?.taskId
      bindTaskWs(project.id, nextTaskId, taskType)

      if (!taskRuntimeByProject[project.id]) {
        updateTaskRuntime(project.id, {
          taskId: nextTaskId,
          status: meta?.status || 'processing',
          progress: 5,
          stageLabel: '正在生成中...',
          updatedAt: new Date().toISOString(),
        })
      }
    })
  }, [projects, kgList, taskMetaByProject, taskRuntimeByProject, bindTaskWs, updateTaskRuntime])

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

  function handleUpdateProject(nextProject) {
    if (!nextProject?.id) return
    setProjects(prev => prev.map(item => (item.id === nextProject.id ? { ...item, ...nextProject } : item)))
    setKgList(prev => prev.map(item => (item.id === nextProject.id ? { ...item, ...nextProject } : item)))
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

  const projectMap = useMemo(() => {
    const map = new Map()
    ;[...projects, ...kgList].forEach((project) => {
      map.set(project.id, project)
    })
    return map
  }, [projects, kgList])

  const taskRows = useMemo(() => {
    const now = Date.now()
    const ids = new Set([
      ...Object.keys(taskRuntimeByProject),
      ...Object.keys(taskMetaByProject),
    ])

    const rows = []
    ids.forEach((projectId) => {
      const runtime = taskRuntimeByProject[projectId] || {}
      const meta = taskMetaByProject[projectId] || {}
      const project = projectMap.get(projectId)

      const status = runtime.status
        || meta.status
        || (GENERATING_PROJECT_STATUSES.has(project?.generation_status) ? 'processing' : '')
      if (!status) return

      const bucket = getTaskBucket(status)
      const updatedAt = runtime.updatedAt
        || (meta.updatedAt ? new Date(meta.updatedAt).toISOString() : '')
        || project?.updatedAt
        || ''
      const updatedMs = toUpdatedMs(updatedAt)
      const inRecentWindow = now - updatedMs <= 24 * 60 * 60 * 1000
      if (bucket !== 'active' && !inRecentWindow) return

      const taskType = normalizeTaskType(meta.taskType || project?.type || runtime.taskType)

      rows.push({
        projectId,
        projectName: project?.name || '未命名项目',
        projectKind: taskType === 'kg' ? '知识图谱' : '故障树',
        taskId: runtime.taskId || meta.taskId || '',
        taskType,
        status,
        bucket,
        progress: clampProgress(runtime.progress, bucket === 'completed' ? 100 : 0),
        stageLabel: runtime.stageLabel || (bucket === 'failed' ? '生成失败' : bucket === 'completed' ? '生成完成' : '正在生成中...'),
        stageHistory: Array.isArray(runtime.stageHistory) ? runtime.stageHistory : [],
        wsState: runtime.wsState || 'idle',
        retryCount: runtime.retryCount || 0,
        errorMessage: runtime.errorMessage || '',
        updatedAt,
        updatedMs,
      })
    })

    return rows.sort((a, b) => b.updatedMs - a.updatedMs)
  }, [taskRuntimeByProject, taskMetaByProject, projectMap])

  const taskCounts = useMemo(() => {
    return taskRows.reduce((acc, row) => {
      acc.all += 1
      if (row.bucket === 'active') acc.active += 1
      if (row.bucket === 'completed') acc.completed += 1
      if (row.bucket === 'failed') acc.failed += 1
      return acc
    }, { all: 0, active: 0, completed: 0, failed: 0 })
  }, [taskRows])

  const filteredTaskRows = useMemo(() => {
    const keyword = taskKeyword.trim().toLowerCase()
    return taskRows.filter((row) => {
      if (taskStatusFilter !== 'all' && row.bucket !== taskStatusFilter) return false
      if (taskTypeFilter !== 'all' && row.taskType !== taskTypeFilter) return false
      if (!keyword) return true
      return row.projectName.toLowerCase().includes(keyword) || row.taskId.toLowerCase().includes(keyword)
    })
  }, [taskRows, taskStatusFilter, taskTypeFilter, taskKeyword])

  const locateProjectFromTask = useCallback((row) => {
    const project = projectMap.get(row.projectId)
    if (!project) return

    setActiveTab(project.type === 'kg' ? 'kg' : 'ft')
    setFocusedProjectId(row.projectId)
    window.setTimeout(() => {
      const target = document.getElementById(`project-card-${row.projectId}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    window.setTimeout(() => {
      setFocusedProjectId((prev) => (prev === row.projectId ? '' : prev))
    }, 2600)
  }, [projectMap])

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

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-4">
        {/* Stats */}
        <Spin spinning={listLoading}>
        <Row gutter={16} className="mb-4">
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

        <SectionErrorBoundary title="任务面板加载失败，请点击重试">
          <TaskCenterPanel
            rows={filteredTaskRows}
            loading={listLoading}
            statusFilter={taskStatusFilter}
            onStatusFilterChange={setTaskStatusFilter}
            typeFilter={taskTypeFilter}
            onTypeFilterChange={setTaskTypeFilter}
            keyword={taskKeyword}
            onKeywordChange={setTaskKeyword}
            counts={taskCounts}
            onLocate={locateProjectFromTask}
          />
        </SectionErrorBoundary>

        

        {/* Project List Header */}
        <div className="flex items-center justify-between mb-2 mt-5">
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
                  taskRuntimeByProject={taskRuntimeByProject}
                  loading={listLoading}
                  highlightedProjectId={focusedProjectId}
                  retryingProjectId={retryingProjectId}
                  search={search}
                  onDelete={handleDeleteProject}
                  onRetry={handleRetryGenerate}
                  onUpdate={handleUpdateProject}
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
                  taskRuntimeByProject={taskRuntimeByProject}
                  loading={listLoading}
                  highlightedProjectId={focusedProjectId}
                  retryingProjectId={retryingProjectId}
                  search={search}
                  onDelete={handleDeleteKg}
                  onRetry={handleRetryGenerate}
                  onUpdate={handleUpdateProject}
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
function ProjectGrid({
  items,
  taskRuntimeByProject,
  highlightedProjectId,
  loading,
  retryingProjectId,
  search,
  onDelete,
  onRetry,
  onUpdate,
  onNew,
  emptyText,
  newLabel,
  newColor = 'blue',
}) {
  const hoverCls = newColor === 'purple'
    ? 'hover:border-purple-400 hover:bg-purple-50 hover:text-purple-500'
    : 'hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500'

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-100 p-4">
            <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 4 }} />
          </div>
        ))}
      </div>
    )
  }

  if (items.length > 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {items.map(p => (
          <ProjectCard
            key={p.id}
            cardId={`project-card-${p.id}`}
            highlighted={highlightedProjectId === p.id}
            project={p}
            onDelete={onDelete}
            taskProgress={taskRuntimeByProject?.[p.id]?.progress}
            taskInfo={taskRuntimeByProject?.[p.id]}
            onRetry={onRetry}
            retryLoading={retryingProjectId === p.id}
            onUpdated={onUpdate}
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

class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between">
        <p className="text-sm text-red-600">{this.props.title || '模块加载失败'}</p>
        <Button size="small" danger ghost onClick={this.handleRetry}>重试</Button>
      </div>
    )
  }
}

function TaskCenterPanel({
  rows,
  loading,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  keyword,
  onKeywordChange,
  counts,
  onLocate,
}) {
  const statusOptions = [
    { key: 'active', label: '运行中', icon: <SyncOutlined spin /> },
    { key: 'completed', label: '已完成', icon: <CheckCircleOutlined /> },
    { key: 'failed', label: '失败', icon: <CloseCircleOutlined /> },
    { key: 'all', label: '全部', icon: <ClockCircleOutlined /> },
  ]

  const typeOptions = [
    { key: 'all', label: '全部类型' },
    { key: 'ft', label: '故障树' },
    { key: 'kg', label: '知识图谱' },
  ]

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-800 m-0">任务中心</h3>
          <Tag color="blue" className="m-0">{counts.all} 条</Tag>
          <Tag color="processing" className="m-0">运行中 {counts.active}</Tag>
          <Tag color="success" className="m-0">已完成 {counts.completed}</Tag>
          <Tag color="error" className="m-0">失败 {counts.failed}</Tag>
        </div>
        <Input
          allowClear
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="搜索项目名或任务ID"
          prefix={<SearchOutlined className="text-gray-400" />}
          style={{ width: 260 }}
          size="small"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {statusOptions.map((item) => (
          <Button
            key={item.key}
            size="small"
            type={statusFilter === item.key ? 'primary' : 'default'}
            icon={item.icon}
            onClick={() => onStatusFilterChange(item.key)}
          >
            {item.label}
          </Button>
        ))}
        <Divider type="vertical" style={{ margin: '0 6px' }} />
        {typeOptions.map((item) => (
          <Button
            key={item.key}
            size="small"
            type={typeFilter === item.key ? 'primary' : 'default'}
            ghost={typeFilter === item.key}
            onClick={() => onTypeFilterChange(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {loading && rows.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="border border-gray-100 rounded-lg p-3">
                <Skeleton active title={{ width: '55%' }} paragraph={{ rows: 2 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="bg-gray-50 rounded-lg py-1">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span className="text-gray-500">当前筛选条件下暂无任务</span>}
            />
          </div>
        )}

        {rows.map((row) => {
          const progressColor = row.bucket === 'failed' ? '#ff4d4f' : row.bucket === 'completed' ? '#52c41a' : '#1677ff'
          return (
            <button
              key={`${row.projectId}-${row.taskId || row.updatedAt}`}
              type="button"
              onClick={() => onLocate(row)}
              className="w-full text-left border border-gray-100 hover:border-blue-300 hover:bg-blue-50/40 rounded-lg p-3 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate m-0">{row.projectName}</p>
                  <p className="text-xs text-gray-400 m-0 mt-0.5">
                    {row.projectKind} · {row.taskId ? `任务 ${row.taskId}` : '任务ID待同步'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {row.retryCount > 0 && <Tag color="orange" className="m-0">重连 {row.retryCount}</Tag>}
                  <Tag color={row.bucket === 'failed' ? 'error' : row.bucket === 'completed' ? 'success' : 'processing'} className="m-0">
                    {row.bucket === 'failed' ? '失败' : row.bucket === 'completed' ? '已完成' : '运行中'}
                  </Tag>
                </div>
              </div>

              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${row.progress}%`, backgroundColor: progressColor }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 truncate m-0">{row.errorMessage || row.stageLabel}</p>
                <p className="text-xs text-gray-400 m-0 shrink-0">{toTimeLabel(row.updatedAt) || '--:--:--'}</p>
              </div>

              {row.stageHistory.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-1 mb-0 truncate">
                  {row.stageHistory.slice(-3).map((item) => item.label).join(' -> ')}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
