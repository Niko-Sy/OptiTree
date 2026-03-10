/**
 * KnowledgeGraphEditor — 知识图谱编辑页面
 * 结构与 FaultTreeEditor.jsx 完全对应：
 *   KnowledgeStoreProvider > KnowledgeEditorInner
 * 数据通过后端 API 持久化（/api/v1/knowledge-graphs/{id}/graph）
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { message, Spin } from 'antd'
import { KnowledgeStoreProvider, useKnowledgeStore, useKnowledgeActions } from '../store/useKnowledgeStore'
import KgToolbar from '../components/knowledge/KgToolbar'
import KgCanvas from '../components/knowledge/KgCanvas'
import KgEntityPalette from '../components/knowledge/KgEntityPalette'
import KgPropertiesPanel from '../components/knowledge/KgPropertiesPanel'
import KgStatusBar from '../components/knowledge/KgStatusBar'
import AIAssistant from '../components/common/AIAssistant'
import { getKnowledgeGraph, saveKnowledgeGraph } from '../services/knowledgeGraphService'
import { getProject } from '../services/projectService'

// ─── 内层组件（含 Store 访问）─────────────────────────────────────
function KnowledgeEditorInner({ kgId, kgName }) {
  const { rfNodes, rfEdges } = useKnowledgeStore()
  const { setGraph } = useKnowledgeActions()

  // rfInstance 引用：由 KgCanvas 通过 onRfInit 回调写入，由 KgToolbar 用于 fitView
  const rfInstanceRef = useRef(null)
  // AI 助手引用：由工具栏按鈕触发弹出
  const aiAssistantRef = useRef(null)
  // 适应屏幕引用：由 KgCanvas 暴露，供工具栏排版后、初始加载后自动调用
  const fitRef = useRef(null)

  // 为 AI 助手提供当前图数据上下文
  const getContext = useCallback(() => ({
    nodes: rfNodes,
    edges: rfEdges,
  }), [rfNodes, rfEdges])

  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [propsCollapsed, setPropsCollapsed] = useState(false)

  const leftOffset  = paletteCollapsed ? 0 : 208
  const rightOffset = propsCollapsed   ? 0 : 256

  // 加载状态 & 防重复保存
  const initDoneRef  = useRef(false)
  const revisionRef  = useRef(null)
  const lastSavedRef = useRef(null)   // JSON fingerprint，防止保存未变更的数据
  const saveTimerRef = useRef(null)

  // ── 初始化：从后端加载图数据 ───────────────────────────────
  useEffect(() => {
    if (!kgId || initDoneRef.current) return
    getKnowledgeGraph(kgId)
      .then(({ rfNodes: n, rfEdges: e, revision }) => {
        revisionRef.current = revision ?? null
        setGraph(n ?? [], e ?? [])
        initDoneRef.current = true
        lastSavedRef.current = JSON.stringify({ rfNodes: n ?? [], rfEdges: e ?? [] })
        // 初始加载完成后自动适应屏幕
        setTimeout(() => fitRef.current?.(), 500)
      })
      .catch(err => {
        if (err?.code !== 404) {
          message.error(err?.message || '加载知识图谱失败')
        }
        initDoneRef.current = true
      })
  }, [kgId]) // eslint-disable-line

  // ── 防抖自动保存（1.5 s）────────────────────────────────────
  useEffect(() => {
    if (!kgId || !initDoneRef.current) return
    const snap = JSON.stringify({ rfNodes, rfEdges })
    if (snap === lastSavedRef.current) return   // 无变更，跳过

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await saveKnowledgeGraph(kgId, {
          rfNodes,
          rfEdges,
          revision: revisionRef.current,
        })
        if (res?.revision != null) revisionRef.current = res.revision
        lastSavedRef.current = snap
      } catch {
        // 静默失败，下次变更时重试
      }
    }, 1500)

    return () => clearTimeout(saveTimerRef.current)
  }, [rfNodes, rfEdges, kgId])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <KgToolbar kgName={kgName} kgId={kgId} rfInstanceRef={rfInstanceRef} aiAssistantRef={aiAssistantRef} fitRef={fitRef} />
      <div className="flex-1 relative overflow-hidden kg-canvas-wrapper">
        <KgCanvas leftOffset={leftOffset} rightOffset={rightOffset} onRfInit={(inst) => { rfInstanceRef.current = inst }} fitRef={fitRef} />
        {/* 左右偏移量仅传入用于 Controls/MiniMap 的内部定位 */}
        <KgEntityPalette collapsed={paletteCollapsed} onCollapsedChange={setPaletteCollapsed} />
        <KgPropertiesPanel collapsed={propsCollapsed} onCollapsedChange={setPropsCollapsed} />
      </div>
      <KgStatusBar />
      <AIAssistant ref={aiAssistantRef} contextType="knowledgeGraph" getContext={getContext} />
    </div>
  )
}

// ─── 页面包装器 ────────────────────────────────────────────────────
export default function KnowledgeGraphEditor() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const kgId = searchParams.get('id')
  const [kgName, setKgName] = useState('未命名知识图谱')
  const [accessReady, setAccessReady] = useState(false)

  useEffect(() => {
    if (!kgId) {
      message.warning('缺少项目 ID')
      navigate('/dashboard')
      return
    }
    getProject(kgId)
      .then(({ project }) => {
        const status = project?.generation_status || 'completed'
        if (status !== 'completed') {
          message.warning('项目仍在生成中，暂不可进入知识图谱编辑器')
          navigate('/dashboard')
          return
        }
        setKgName(project?.name || '未命名知识图谱')
        setAccessReady(true)
      })
      .catch(() => {
        message.error('项目不存在或无访问权限')
        navigate('/dashboard')
      })
  }, [kgId, navigate])

  if (!accessReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Spin tip="加载项目中..." />
      </div>
    )
  }

  return (
    <KnowledgeStoreProvider>
      <KnowledgeEditorInner kgId={kgId} kgName={kgName} />
    </KnowledgeStoreProvider>
  )
}
