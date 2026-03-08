// 故障树编辑器页面，包含画布、工具栏、属性面板等组件，并处理项目数据的加载和保存
import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { EditorStoreProvider, useEditorStore, useEditorActions } from '../store/useEditorStore'
import Toolbar from '../components/editor/Toolbar'
import NodePalette from '../components/editor/NodePalette'
import Canvas from '../components/editor/Canvas'
import PropertiesPanel from '../components/editor/PropertiesPanel'
import StatusBar from '../components/editor/StatusBar'
import { computeLayout } from '../utils/layoutAlgorithm'
import AIAssistant from '../components/common/AIAssistant'
import { getFaultTreeGraph, saveFaultTreeGraph } from '../services/faultTreeService'
import { getProject } from '../services/projectService'

// ─── Inner editor (needs access to store) ────────────────────────
function EditorInner({ projectId, projectName }) {
  const { state } = useEditorStore()
  const { setGraph } = useEditorActions()

  // 为 AI 助手提供当前图数据上下文
  const getContext = useCallback(() => ({
    nodes: state.nodes,
    edges: state.edges,
  }), [state.nodes, state.edges])

  const canvasWidthRef = useRef(null)
  const [propsPanelCollapsed, setPropsPanelCollapsed] = useState(false)
  const rightOffset = propsPanelCollapsed ? 0 : 256

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
    const snap = JSON.stringify({ nodes: state.nodes, edges: state.edges })
    if (snap === lastSavedRef.current) return   // 无变更，跳过

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await saveFaultTreeGraph(projectId, {
          nodes: state.nodes,
          edges: state.edges,
          revision: revisionRef.current,
        })
        if (res?.revision != null) revisionRef.current = res.revision
        lastSavedRef.current = snap
      } catch {
        // 静默失败，下次变更时重试
      }
    }, 1500)

    return () => clearTimeout(saveTimerRef.current)
  }, [state.nodes, state.edges, projectId])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar
        projectName={projectName}
        canvasWidth={canvasWidthRef.current?.() || 900}
      />
      <div className="flex-1 relative overflow-hidden">
        <Canvas onSizeRef={canvasWidthRef} rightOffset={rightOffset} />
        <NodePalette />
        <PropertiesPanel collapsed={propsPanelCollapsed} onCollapsedChange={setPropsPanelCollapsed} />
      </div>
      <StatusBar />
      <AIAssistant contextType="faultTree" getContext={getContext} />
    </div>
  )
}

// ─── Page wrapper ─────────────────────────────────────────────────
export default function FaultTreeEditor() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('id')
  const [projectName, setProjectName] = useState('未命名项目')

  useEffect(() => {
    if (!projectId) return
    getProject(projectId)
      .then(({ project }) => setProjectName(project?.name || '未命名项目'))
      .catch(() => {})
  }, [projectId])

  return (
    <EditorStoreProvider>
      <EditorInner projectId={projectId} projectName={projectName} />
    </EditorStoreProvider>
  )
}
