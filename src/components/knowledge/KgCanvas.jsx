/**
 * KgCanvas — 知识图谱画布（基于 React Flow）
 * 使用 React Flow 的视口裁剪特性处理大规模知识图谱
 */
import { useCallback, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  BackgroundVariant, Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useKnowledgeStore, useKnowledgeActions } from '../../store/useKnowledgeStore'
import { ENTITY_TYPES } from './KgEntityPalette'

// ─── 实体类型 → 菜单颜色映射（用于 MiniMap） ──────────────────────
const NODE_MINIMAP_COLOR = {
  entityNode:    '#ede9fe',
  eventNode:     '#e0f2fe',
  componentNode: '#d1fae5',
  causeNode:     '#fff7ed',
}

// ─── 自定义节点组件 ────────────────────────────────────────────────
import { Handle, Position } from 'reactflow'

function KgNode({ data, type, selected, style: nodeStyle }) {
  const cfg = ENTITY_TYPES[type] ?? ENTITY_TYPES.entityNode
  return (
    <div
      style={{
        background: cfg.bg,
        border: `2px solid ${selected ? '#1677ff' : cfg.border}`,
        borderRadius: 8,
        padding: '6px 12px',
        minWidth: nodeStyle?.width ? undefined : 100,
        maxWidth: nodeStyle?.width ? undefined : 180,
        width:  nodeStyle?.width  ?? undefined,
        height: nodeStyle?.height ?? undefined,
        boxShadow: selected ? `0 0 0 2px #1677ff44` : '0 1px 4px rgba(0,0,0,.1)',
        fontSize: 12,
        color: cfg.color,
        fontWeight: 600,
        textAlign: 'center',
        cursor: 'grab',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: cfg.border, width: 8, height: 8 }} />
      <div className="truncate">{data.label || '未命名'}</div>
      {data.entityType && data.entityType !== type && (
        <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, color: cfg.border }}>
          {ENTITY_TYPES[data.entityType]?.label ?? data.entityType}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: cfg.border, width: 8, height: 8 }} />
    </div>
  )
}

const nodeTypes = {
  entityNode:    (props) => <KgNode {...props} type="entityNode" />,
  eventNode:     (props) => <KgNode {...props} type="eventNode" />,
  componentNode: (props) => <KgNode {...props} type="componentNode" />,
  causeNode:     (props) => <KgNode {...props} type="causeNode" />,
}

// ─── 默认边样式 ────────────────────────────────────────────────────
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  labelStyle: { fontSize: 11, fill: '#64748b' },
  labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
}

// ─── 主画布组件 ────────────────────────────────────────────────────
export default function KgCanvas({ leftOffset = 208, rightOffset = 256 }) {
  // leftOffset / rightOffset 仅用于定位内部控件，画布本身铺满全区域
  const { rfNodes, rfEdges } = useKnowledgeStore()
  const {
    onNodesChange, onEdgesChange, onConnect,
    onNodeDragStop: commitNodeMoves, addNode, select, deleteNode,
  } = useKnowledgeActions()
  const reactFlowWrapper = useRef(null)
  const [reactFlowInstance, setReactFlowInstance] = [null, () => {}]
  const rfInstanceRef = useRef(null)

  // ── 节点选中 ──────────────────────────────────────────────
  const handleSelectionChange = useCallback(({ nodes, edges }) => {
    const nodeIds = nodes.map(n => n.id)
    const edgeId = edges[0]?.id ?? null
    select(nodeIds, edgeId)
  }, [select])

  // ── 拖拽节点：通知左侧面板显示垃圾桶区域 ──────────────────
  const handleNodeDragStart = useCallback(() => {
    window.dispatchEvent(new CustomEvent('kgNodeDragStart'))
  }, [])

  // 拖拽过程中：实时检测是否悉停在左侧面板区域
  const handleNodeDrag = useCallback((event) => {
    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    const relX = event.clientX - (bounds?.left ?? 0)
    const overPalette = relX < leftOffset && leftOffset > 0
    window.dispatchEvent(new CustomEvent('kgNodeOverPalette', { detail: { over: overPalette } }))
  }, [leftOffset])

  const handleNodeDragStop = useCallback((event, node) => {
    window.dispatchEvent(new CustomEvent('kgNodeDragEnd'))
    commitNodeMoves()
    // 若拖入左侧面板区域（clientX < leftOffset）则删除节点
    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    const relX = event.clientX - (bounds?.left ?? 0)
    if (relX < leftOffset && leftOffset > 0) {
      deleteNode(node.id)
    }
  }, [commitNodeMoves, deleteNode, leftOffset])

  // ── 拖放创建节点 ───────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const nodeType = e.dataTransfer.getData('application/kg-node-type')
    if (!nodeType || !rfInstanceRef.current) return

    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    const position = rfInstanceRef.current.project({
      x: e.clientX - (bounds?.left ?? 0),
      y: e.clientY - (bounds?.top ?? 0),
    })

    const cfg = ENTITY_TYPES[nodeType] ?? ENTITY_TYPES.entityNode
    addNode({
      id: `node_${Date.now()}`,
      type: nodeType,
      position,
      data: {
        label: `新${cfg.label}`,
        entityType: nodeType,
        description: '',
        sourceDoc: '',
      },
    })
  }, [addNode])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // ── 双击空白区域创建默认实体节点 ───────────────────────────
  const handlePaneDoubleClick = useCallback((e) => {
    if (!rfInstanceRef.current) return
    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    const position = rfInstanceRef.current.project({
      x: e.clientX - (bounds?.left ?? 0),
      y: e.clientY - (bounds?.top ?? 0),
    })
    addNode({
      id: `node_${Date.now()}`,
      type: 'entityNode',
      position,
      data: { label: '新实体', entityType: 'entityNode', description: '', sourceDoc: '' },
    })
  }, [addNode])

  return (
    <div
      ref={reactFlowWrapper}
      className="absolute inset-0 bg-gray-50"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        onPaneClick={() => select([], null)}
        onPaneDoubleClick={handlePaneDoubleClick}
        onInit={(inst) => { rfInstanceRef.current = inst }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        minZoom={0.1}
        maxZoom={3}
        connectionLineStyle={{ stroke: '#1677ff', strokeWidth: 2 }}
        snapToGrid={false}
        elevateNodesOnSelect
        proOptions={{ hideAttribution: true }}
      >
        {/* 背景网格 —— 与故障树画布视觉协调（点阵风格） */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#dde3ea"
        />

        {/* 缩放控制按钮（左下角，偏移避开侧边栏） */}
        <Controls
          showInteractive={false}
          style={{ bottom: 12, left: leftOffset + 12 }}
        />

        {/* 小地图（右下角，偏移避开属性面板） */}
        <MiniMap
          nodeColor={(n) => NODE_MINIMAP_COLOR[n.type] ?? '#e2e8f0'}
          nodeStrokeWidth={2}
          zoomable
          pannable
          style={{ bottom: 12, right: rightOffset + 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
        />

        {/* 空态提示面板 */}
        {rfNodes.length === 0 && (
          <Panel position="top-center" style={{ marginTop: '20%' }}>
            <div className="text-center text-gray-400">
              <p className="text-lg font-medium mb-1">画布为空</p>
              <p className="text-sm">从左侧拖入实体类型，或双击画布空白区域创建节点</p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
