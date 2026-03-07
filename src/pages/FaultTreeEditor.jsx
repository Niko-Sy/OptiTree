// 故障树编辑器页面，包含画布、工具栏、属性面板等组件，并处理项目数据的加载和保存
import { useRef, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EditorStoreProvider, useEditorStore, useEditorActions } from '../store/useEditorStore'
import Toolbar from '../components/editor/Toolbar'
import NodePalette from '../components/editor/NodePalette'
import Canvas from '../components/editor/Canvas'
import PropertiesPanel from '../components/editor/PropertiesPanel'
import StatusBar from '../components/editor/StatusBar'
import { computeLayout } from '../utils/layoutAlgorithm'

const STORAGE_KEY = 'optitree_projects'

// ─── Inner editor (needs access to store) ────────────────────────
function EditorInner({ projectId, projectName }) {
  const { state } = useEditorStore()
  const { setGraph } = useEditorActions()
  const canvasWidthRef = useRef(null)
  const [propsPanelCollapsed, setPropsPanelCollapsed] = useState(false)
  const rightOffset = propsPanelCollapsed ? 0 : 256

  // Load saved graph from localStorage
  useEffect(() => {
    if (!projectId) return
    try {
      const raw = localStorage.getItem(`optitree_data_${projectId}`)
      if (raw) {
        let { nodes, edges } = JSON.parse(raw)
        nodes = nodes || []
        edges = edges || []
        // If all nodes have zero coords (template data), apply auto-layout
        const needsLayout = nodes.length > 0 && nodes.every(n => n.x === 0 && n.y === 0)
        if (needsLayout) {
          const canvasWidth = canvasWidthRef.current?.() || 900
          nodes = computeLayout(nodes, edges, canvasWidth)
        }
        setGraph(nodes, edges)
      }
    } catch {}
  }, [projectId]) // eslint-disable-line

  // Auto-save on state change
  useEffect(() => {
    if (!projectId) return
    localStorage.setItem(
      `optitree_data_${projectId}`,
      JSON.stringify({ nodes: state.nodes, edges: state.edges })
    )
    // Update project metadata (nodeCount / edgeCount) in project list
    try {
      const projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      const updated = projects.map(p =>
        p.id === projectId
          ? { ...p, nodeCount: state.nodes.length, edgeCount: state.edges.length }
          : p
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {}
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
    </div>
  )
}

// ─── Page wrapper ─────────────────────────────────────────────────
export default function FaultTreeEditor() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('id')

  // Resolve project name from localStorage
  let projectName = '未命名项目'
  try {
    const projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    projectName = projects.find(p => p.id === projectId)?.name || '未命名项目'
  } catch {}

  return (
    <EditorStoreProvider>
      <EditorInner projectId={projectId} projectName={projectName} />
    </EditorStoreProvider>
  )
}
