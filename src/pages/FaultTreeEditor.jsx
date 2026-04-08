// 故障树编辑器页面，包含画布、工具栏、属性面板等组件，并处理项目数据的加载和保存
import { useRef, useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { message, Spin } from 'antd'
import { EditorStoreProvider, useEditorActions } from '../store/useEditorStore'
import { useEditorStore as _useRawStore, shallow } from '../store/editorStore'
import Toolbar from '../components/editor/Toolbar'
import NodePalette from '../components/editor/NodePalette'
import Canvas from '../components/editor/Canvas'
import PropertiesPanel from '../components/editor/PropertiesPanel'
import StatusBar from '../components/editor/StatusBar'
import { computeLayout } from '../utils/layoutAlgorithm'
import AIAssistant from '../components/common/AIAssistant'
import { getFaultTreeGraph, saveFaultTreeGraph } from '../services/faultTreeService'
import { getProject } from '../services/projectService'

const TASK_META_STORAGE_KEY = 'optitree_ai_task_meta'
const ACTIVE_TASK_STATUSES = new Set(['pending', 'processing', 'retrying', 'queued', 'dispatching', 'accepted', 'parsing', 'producer_queued', 'waiting_project_slot', 'dispatch_retrying', 'enqueued', 'generating'])

function hasBlockingTaskMeta(projectId) {
  if (!projectId) return false
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_META_STORAGE_KEY) || '{}')
    const meta = parsed?.[projectId]
    if (!meta) return false

    const status = meta.status || 'pending'
    if (status === 'completed') return false
    if (ACTIVE_TASK_STATUSES.has(status)) return true
    if (status === 'failed' || status === 'dead' || status === 'cancelled') return true

    const updatedAt = Number(meta.updatedAt || 0)
    if (!updatedAt) return true
    return (Date.now() - updatedAt) < 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

// ─── Inner editor (needs access to store) ────────────────────────
function EditorInner({ projectId, projectName }) {
  const nodes = _useRawStore(s => s.nodes, shallow)
  const edges = _useRawStore(s => s.edges, shallow)
  const { setGraph } = useEditorActions()

  const canvasWidthRef = useRef(null)
  // AI 助手引用：由工具栏按钮触发弹出
  const aiAssistantRef = useRef(null)
  // 适应屏幕引用：由 Canvas 暴露，供工具栏排版后、初始加载后自动调用
  const fitRef = useRef(null)
  // Canvas 写入当前隐藏节点集合，Toolbar 排版时读取以跳过隐藏节点
  const hiddenIdsRef = useRef(new Set())
  const [propsPanelCollapsed, setPropsPanelCollapsed] = useState(false)
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const rightOffset = propsPanelCollapsed ? 0 : 256
  const leftOffset = paletteCollapsed ? 0 : 208

  // 加载初始化标志 & 自动保存状态追踪
  const initDoneRef  = useRef(false)
  const revisionRef  = useRef(null)
  const lastSavedRef = useRef(null)   // JSON fingerprint，防止保存未变更的数据
  const saveTimerRef = useRef(null)

  // ── 从后端加载图数据 ──────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    getFaultTreeGraph(projectId)
      .then(({ nodes, edges, revision }) => {
        revisionRef.current = revision ?? null
        const n = nodes || []
        const e = edges || []
        // 如果所有节点坐标为 0（模板导入后未排版），自动排版
        const needsLayout = n.length > 0 && n.every(nd => nd.x === 0 && nd.y === 0)
        const finalNodes = needsLayout
          ? computeLayout(n, e, canvasWidthRef.current?.() || 900)
          : n
        setGraph(finalNodes, e)
        initDoneRef.current = true
        lastSavedRef.current = JSON.stringify({ nodes: finalNodes, edges: e })
        // 初始加载完成后自动适应屏幕（等待 collapse 状态和节点渲染就绪）
        setTimeout(() => fitRef.current?.(), 450)
      })
      .catch(err => {
        if (err?.code !== 404) {
          message.error(err?.message || '加载图数据失败')
        }
        initDoneRef.current = true
      })
  }, [projectId]) // eslint-disable-line

  // ── 防抖自动保存（1.5 s）────────────────────────────────────
  useEffect(() => {
    if (!projectId || !initDoneRef.current) return
    const snap = JSON.stringify({ nodes, edges })
    if (snap === lastSavedRef.current) return   // 无变更，跳过

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await saveFaultTreeGraph(projectId, {
          nodes,
          edges,
          revision: revisionRef.current,
        })
        if (res?.revision != null) revisionRef.current = res.revision
        lastSavedRef.current = snap
      } catch {
        // 静默失败，下次变更时重试
      }
    }, 1500)

    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges, projectId])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar
        projectName={projectName}
        canvasWidth={canvasWidthRef.current?.() || 900}
        aiAssistantRef={aiAssistantRef}
        fitRef={fitRef}
        hiddenIdsRef={hiddenIdsRef}
      />
      <div className="flex-1 relative overflow-hidden">
        <Canvas onSizeRef={canvasWidthRef} rightOffset={rightOffset} leftOffset={leftOffset} fitRef={fitRef} hiddenIdsRef={hiddenIdsRef} />
        <NodePalette collapsed={paletteCollapsed} onCollapsedChange={setPaletteCollapsed} />
        <PropertiesPanel collapsed={propsPanelCollapsed} onCollapsedChange={setPropsPanelCollapsed} />
      </div>
      <StatusBar />
      <AIAssistant ref={aiAssistantRef} contextType="faultTree" projectId={projectId} />
    </div>
  )
}

// ─── Page wrapper ─────────────────────────────────────────────────
export default function FaultTreeEditor() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('id')
  const [projectName, setProjectName] = useState('未命名项目')
  const [accessReady, setAccessReady] = useState(false)

  useEffect(() => {
    if (!projectId) {
      message.warning('缺少项目 ID')
      navigate('/dashboard')
      return
    }
    getProject(projectId)
      .then(({ project }) => {
        const blockedByMeta = hasBlockingTaskMeta(projectId)
        const status = project?.generation_status || (blockedByMeta ? 'generating' : 'completed')
        if (status !== 'completed' || blockedByMeta) {
          message.warning('项目仍在生成中，暂不可进入编辑器')
          navigate('/dashboard')
          return
        }
        setProjectName(project?.name || '未命名项目')
        setAccessReady(true)
      })
      .catch(() => {
        message.error('项目不存在或无访问权限')
        navigate('/dashboard')
      })
  }, [projectId, navigate])

  if (!accessReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Spin tip="加载项目中..." />
      </div>
    )
  }

  return (
    <EditorStoreProvider>
      <EditorInner projectId={projectId} projectName={projectName} />
    </EditorStoreProvider>
  )
}
