/**
 * KnowledgeGraphEditor — 知识图谱编辑页面
 * 结构与 FaultTreeEditor.jsx 完全对应：
 *   KnowledgeStoreProvider > KnowledgeEditorInner
 * 数据通过 localStorage key: optitree_kg_<id> 持久化
 */
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KnowledgeStoreProvider, useKnowledgeStore, useKnowledgeActions } from '../store/useKnowledgeStore'
import KgToolbar from '../components/knowledge/KgToolbar'
import KgCanvas from '../components/knowledge/KgCanvas'
import KgEntityPalette from '../components/knowledge/KgEntityPalette'
import KgPropertiesPanel from '../components/knowledge/KgPropertiesPanel'
import KgStatusBar from '../components/knowledge/KgStatusBar'

const KG_LIST_KEY = 'optitree_kg_list'

// ─── 内层组件（含 Store 访问）─────────────────────────────────────
function KnowledgeEditorInner({ kgId, kgName }) {
  const { rfNodes, rfEdges } = useKnowledgeStore()
  const { setGraph } = useKnowledgeActions()
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [propsCollapsed, setPropsCollapsed] = useState(false)
  const initDone = useRef(false)

  const leftOffset  = paletteCollapsed ? 0 : 208
  const rightOffset = propsCollapsed   ? 0 : 256

  // ── 初始化：从 localStorage 加载图数据 ─────────────────────
  useEffect(() => {
    if (!kgId || initDone.current) return
    initDone.current = true
    try {
      const raw = localStorage.getItem(`optitree_kg_${kgId}`)
      if (raw) {
        const { rfNodes: n, rfEdges: e } = JSON.parse(raw)
        setGraph(n ?? [], e ?? [])
      }
    } catch {}
  }, [kgId]) // eslint-disable-line

  // ── 自动保存 ────────────────────────────────────────────────
  useEffect(() => {
    if (!kgId) return
    localStorage.setItem(
      `optitree_kg_${kgId}`,
      JSON.stringify({ rfNodes, rfEdges })
    )
    // 同步更新 KG 列表中的实体数/关系数
    try {
      const list = JSON.parse(localStorage.getItem(KG_LIST_KEY) || '[]')
      const updated = list.map(k =>
        k.id === kgId
          ? { ...k, entityCount: rfNodes.length, relationCount: rfEdges.length }
          : k
      )
      localStorage.setItem(KG_LIST_KEY, JSON.stringify(updated))
    } catch {}
  }, [rfNodes, rfEdges, kgId])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <KgToolbar kgName={kgName} kgId={kgId} />
      <div className="flex-1 relative overflow-hidden">
        <KgCanvas leftOffset={leftOffset} rightOffset={rightOffset} />
        {/* 左右偏移量仅传入用于 Controls/MiniMap 的内部定位 */}
        <KgEntityPalette collapsed={paletteCollapsed} onCollapsedChange={setPaletteCollapsed} />
        <KgPropertiesPanel collapsed={propsCollapsed} onCollapsedChange={setPropsCollapsed} />
      </div>
      <KgStatusBar />
    </div>
  )
}

// ─── 页面包装器 ────────────────────────────────────────────────────
export default function KnowledgeGraphEditor() {
  const [searchParams] = useSearchParams()
  const kgId = searchParams.get('id')

  let kgName = '未命名知识图谱'
  try {
    const list = JSON.parse(localStorage.getItem(KG_LIST_KEY) || '[]')
    kgName = list.find(k => k.id === kgId)?.name || '未命名知识图谱'
  } catch {}

  return (
    <KnowledgeStoreProvider>
      <KnowledgeEditorInner kgId={kgId} kgName={kgName} />
    </KnowledgeStoreProvider>
  )
}
