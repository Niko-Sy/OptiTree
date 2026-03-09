// 画布组件，负责渲染节点和连线，处理节点拖动、连线创建、画布缩放等交互
import { useRef, useCallback, memo, useState, useEffect, useMemo } from 'react'
import { Tooltip, message } from 'antd'
import {
  ArrowsAltOutlined, DragOutlined, LinkOutlined,
  ZoomInOutlined, ZoomOutOutlined, CompressOutlined,
} from '@ant-design/icons'
import { useEditorStore, useEditorActions } from '../../store/useEditorStore'
import { GateSymbol, GATE_CONFIG } from './GateSymbol'

const MIN_SCALE = 0.15
const MAX_SCALE = 3
const ZOOM_STEP = 0.12



// ── Single Node (HTML div) ──────────────────────────────────────
const FaultNode = memo(function FaultNode({
  node, selected, multiSelected, isConnectFrom, mode,
  onMouseDown, onClick, onMouseEnter, onMouseLeave, onContextMenu, onDragStart,
  hasChildren, isCollapsed, onToggleCollapse,
}) {
  const typeClass = {
    topEvent: 'top-event', midEvent: 'mid-event',
    basicEvent: 'basic-event',
  }[node.type] || (node.type === 'gate' ? '' : 'mid-event')

  // Gate nodes use inline style for per-type colors
  const gateLabel = node.type === 'gate' ? (node.gateType || node.name) : null
  const gateCfg = gateLabel ? (GATE_CONFIG[gateLabel] ?? GATE_CONFIG.OR) : null

  const gateStyle = gateCfg ? {
    background: gateCfg.bg,
    border: `2px solid ${gateCfg.color}`,
    borderRadius: 10,
    flexDirection: 'column',
    gap: 2,
  } : {}

  return (
    <div
      className={`fault-node ${typeClass} ${selected ? 'selected' : ''}`}
      draggable
      style={{
        left: node.x - node.width / 2,
        top: node.y,
        width: node.width,
        height: node.height,
        cursor: mode === 'pan' ? 'grab' : mode === 'connect' ? 'crosshair' : 'pointer',
        outline: isConnectFrom ? '2.5px solid #7c3aed' : multiSelected ? '2.5px dashed #1677ff' : undefined,
        boxShadow: isConnectFrom ? '0 0 0 4px rgba(124,58,237,0.2)' : multiSelected ? '0 0 0 4px rgba(22,119,255,0.15)' : undefined,
        ...gateStyle,
      }}
      onMouseDown={e => onMouseDown(e, node)}
      onClick={e => { e.stopPropagation(); onClick(node, e) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node) }}
      onMouseEnter={() => onMouseEnter(node.id)}
      onMouseLeave={() => onMouseLeave()}
      onDragStart={e => onDragStart(e, node)}
    >
      {/* Expand/collapse button for topEvent and midEvent nodes with children */}
      {(node.type === 'topEvent' || node.type === 'midEvent') && hasChildren && (
        <button
          style={{
            position: 'absolute',
            top: node.type === 'topEvent' ? -5 : -10,
            right: node.type === 'topEvent' ? 10 : -10,
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: `1px solid ${isCollapsed ? '#1677ff' : '#94a3b8'}`,
            background: isCollapsed ? '#eff6ff' : '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            lineHeight: 1,
            fontWeight: 700,
            color: isCollapsed ? '#1677ff' : '#64748b',
            zIndex: 5,
            // boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
            padding: 0,
            flexShrink: 0,
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleCollapse(node.id) }}
          title={isCollapsed ? '展开子节点' : '收起子节点'}
        >
          {isCollapsed ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 2V8M2 5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
        </button>
      )}
      {gateLabel ? (
        <>
          <GateSymbol gateLabel={gateLabel} size={node.width * 0.72} />
          <span style={{ fontSize: 9, fontWeight: 700, color: gateCfg.text, lineHeight: 1, letterSpacing: 0.5 }}>
            {gateLabel}
          </span>
        </>
      ) : node.name}
    </div>
  )
})

// ── Edge (SVG) ──────────────────────────────────────────────────
const EdgePath = memo(function EdgePath({ edge, nodeMap, selected, onClick, onContextMenu, onMidMouseDown }) {
  const p = nodeMap[edge.from]; const c = nodeMap[edge.to]
  if (!p || !c) return null
  const sx = p.x, sy = p.y + p.height, ex = c.x, ey = c.y
  const bx = edge.bendX || 0, by = edge.bendY || 0
  const cp1x = sx + bx * 0.5, cp1y = sy + 50 + by * 0.5
  const cp2x = ex + bx * 0.5, cp2y = ey - 50 + by * 0.5
  const d = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`
  // Approximate bezier midpoint at t=0.5
  const hmx = (sx + cp1x * 3 + cp2x * 3 + ex) / 8
  const hmy = (sy + cp1y * 3 + cp2y * 3 + ey) / 8
  return (
    <g>
      <path d={d} stroke="transparent" strokeWidth={12} fill="none" pointerEvents="all"
        style={{ cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onClick(edge.id) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, edge.id) }} />
      <path d={d} stroke={selected ? '#1677ff' : '#94a3b8'}
        strokeWidth={selected ? 2.5 : 2} fill="none" pointerEvents="none" />
      {selected && (
        <circle
          cx={hmx} cy={hmy} r={6}
          fill="#fff" stroke="#1677ff" strokeWidth={2}
          style={{ cursor: 'grab', pointerEvents: 'all' }}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onMidMouseDown(e, edge.id, bx, by) }}
        />
      )}
    </g>
  )
})

// ── Canvas Controls (bottom-right) ──────────────────────────────
function CanvasControls({ mode, setMode, scale, onZoomIn, onZoomOut, onFit, rightOffset = 0 }) {
  const modes = [
    { key: 'select',  icon: <ArrowsAltOutlined />, tip: '选择 / 移动节点 (V)' },
    { key: 'pan',     icon: <DragOutlined />,       tip: '平移画布 (H)' },
    { key: 'connect', icon: <LinkOutlined />,       tip: '连接节点 (C)' },
  ]
  return (
    <div
      className="absolute bottom-4 flex flex-col gap-2 z-30 select-none transition-all duration-200"
      style={{ right: rightOffset + 16 }}
    >
      <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden flex flex-col">
        {modes.map(btn => (
          <Tooltip key={btn.key} title={btn.tip} placement="left">
            <button
              className={
                'w-9 h-9 flex items-center justify-center text-sm transition-colors ' +
                (mode === btn.key ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100')
              }
              onClick={() => setMode(btn.key)}
            >{btn.icon}</button>
          </Tooltip>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden flex flex-col items-center">
        <Tooltip title="放大 (+)" placement="left">
          <button className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100"
            onClick={onZoomIn}><ZoomInOutlined /></button>
        </Tooltip>
        <div className="text-xs text-gray-500 font-mono py-0.5 border-y border-gray-100 w-full text-center">
          {Math.round(scale * 100)}%
        </div>
        <Tooltip title="缩小 (-)" placement="left">
          <button className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100"
            onClick={onZoomOut}><ZoomOutOutlined /></button>
        </Tooltip>
        <Tooltip title="适应屏幕 (F)" placement="left">
          <button className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 border-t border-gray-100"
            onClick={onFit}><CompressOutlined /></button>
        </Tooltip>
      </div>
    </div>
  )
}

// ── Context Menu ────────────────────────────────────────────────
function ContextMenu({ menu, onClose, state, deleteEdge, deleteNode, onCopy, onPaste }) {
  if (!menu) return null
  const { x, y, type, targetId } = menu

  // Keep menu inside viewport
  const vw = window.innerWidth, vh = window.innerHeight
  const W = 200, H = 90
  const left = x + W > vw ? x - W : x
  const top  = y + H > vh ? y - H : y

  const Sep = () => <div className="my-1 border-t border-gray-100" />
  const Item = ({ label, sub, danger, active, disabled, onClick: handleClick }) => (
    <div
      className={[
        'flex items-center gap-2 px-3 py-1.5 text-sm rounded-sm select-none',
        disabled  ? 'text-gray-400 cursor-default' : 'cursor-pointer',
        danger && !disabled ? 'text-red-500 hover:bg-red-50' : '',
        active    ? 'text-blue-500 font-semibold' : '',
        !disabled && !danger && !active ? 'text-gray-700 hover:bg-gray-50' : '',
      ].join(' ')}
      onMouseDown={disabled ? undefined : e => { e.stopPropagation(); handleClick() }}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-blue-500' : 'bg-transparent'}`} />
      <span className="flex-1">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )

  let content
  if (type === 'node') {
    const node = state.nodes.find(n => n.id === targetId)
    content = (
      <>
        <div className="px-3 py-1 text-xs text-gray-400 font-medium truncate max-w-48">{node?.name || targetId}</div>
        <Sep />
        <Item label="复制节点" sub="Ctrl+C" onClick={() => { onCopy([targetId]); onClose() }} />
        {state.clipboard && <Item label="粘贴" sub="Ctrl+V" onClick={() => { onPaste(); onClose() }} />}
        <Sep />
        <Item label="删除节点" danger onClick={() => { deleteNode(targetId); onClose() }} />
      </>
    )
  } else if (type === 'node-multi') {
    // Multi-select context menu
    content = (
      <>
        <div className="px-3 py-1 text-xs text-gray-400 font-medium">已选中 {state.selectedNodeIds.length} 个节点</div>
        <Sep />
        <Item label="复制选中" sub="Ctrl+C" onClick={() => { onCopy(state.selectedNodeIds); onClose() }} />
        {state.clipboard && <Item label="粘贴" sub="Ctrl+V" onClick={() => { onPaste(); onClose() }} />}
        <Sep />
        <Item label="删除选中" danger onClick={() => { onClose() /* handled outside */ ; document.dispatchEvent(new CustomEvent('deleteMulti', { detail: state.selectedNodeIds })) }} />
      </>
    )
  } else if (type === 'canvas') {
    content = state.clipboard
      ? <Item label="粘贴" sub="Ctrl+V" onClick={() => { onPaste(); onClose() }} />
      : <div className="px-3 py-1.5 text-xs text-gray-400">从左侧节点库拖入节点</div>
  } else if (type === 'edge') {
    const edge = state.edges.find(e => e.id === targetId)
    const fromNode = edge ? state.nodes.find(n => n.id === edge.from) : null
    const toNode   = edge ? state.nodes.find(n => n.id === edge.to)   : null
    content = (
      <>
        <div className="px-3 py-1 text-xs text-gray-400 font-medium truncate max-w-48">
          {fromNode?.name ?? edge?.from} → {toNode?.name ?? edge?.to}
        </div>
        <Sep />
        <Item label="删除连线" danger onClick={() => { deleteEdge(targetId); onClose() }} />
      </>
    )
  }

  return (
    <div
      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-48 z-9999"
      style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {content}
    </div>
  )
}

// ── Main Canvas ─────────────────────────────────────────────────
export default function Canvas({ onSizeRef, rightOffset = 0 }) {
  const { state } = useEditorStore()
  const { addNode, moveNode, commitMove, selectNode, selectEdge, deselect, addEdge, deleteEdge, deleteNode, undo, redo, updateEdge, selectNodes, deleteNodes, moveNodes, commitMoveNodes, copyNodes, pasteNodes } = useEditorActions()
  const containerRef = useRef(null)

  const [vt, setVt] = useState({ x: 40, y: 40, scale: 1 })
  const vtRef = useRef(vt)
  useEffect(() => { vtRef.current = vt }, [vt])

  const [mode, setMode] = useState('select')
  const modeRef = useRef('select')
  useEffect(() => { modeRef.current = mode }, [mode])

  const [collapsedNodes, setCollapsedNodes] = useState(new Set())
  // Track whether we've done the initial "collapse all" pass
  const collapsedInitRef = useRef(false)

  // ── 首次加载图数据时，默认收缩所有有子节点的父节点 ────────
  useEffect(() => {
    if (collapsedInitRef.current) return
    if (state.nodes.length === 0) return
    const parentIds = new Set(state.edges.map(e => e.from))
    if (parentIds.size === 0) return
    collapsedInitRef.current = true
    setCollapsedNodes(parentIds)
  }, [state.nodes, state.edges])

  // 当图被整体替换（导入等操作）时重置收缩状态（节点数变化超过阈值视为整体替换）
  const prevNodeCountRef = useRef(0)
  useEffect(() => {
    const cur = state.nodes.length
    const prev = prevNodeCountRef.current
    // Only re-collapse when it looks like a full graph replacement (not single add/remove)
    if (collapsedInitRef.current && Math.abs(cur - prev) > 3 && cur > 0) {
      const parentIds = new Set(state.edges.map(e => e.from))
      setCollapsedNodes(parentIds)
    }
    prevNodeCountRef.current = cur
  }, [state.nodes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCollapse = useCallback((nodeId) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const [connectFrom, setConnectFrom] = useState(null)
  const connectFromRef = useRef(null)
  useEffect(() => { connectFromRef.current = connectFrom }, [connectFrom])

  const [tempLine, setTempLine] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null)  // { x, y, type, targetId }

  const draggingNode = useRef(null)   // { nodeId, offsetX, offsetY }
  const draggingMulti = useRef(null)  // { ids, startX, startY, startPositions:{id:{x,y}} }
  const draggingEdgeMid = useRef(null) // { edgeId, startBx, startBy, startClientX, startClientY }
  const lassoRef = useRef(null)       // { startX, startY } in canvas coords
  const [lasso, setLasso] = useState(null) // { x1,y1,x2,y2 } canvas coords
  const panRef = useRef(null)
  const rightClickRef = useRef(null)  // { startTime, moved } — persists past mouseup for contextmenu check
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  if (onSizeRef) onSizeRef.current = () => containerRef.current?.clientWidth || 900

  // ── Coordinate conversion ────────────────────────────────────
  function screenToCanvas(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect()
    const v = vtRef.current
    return { x: (clientX - rect.left - v.x) / v.scale, y: (clientY - rect.top - v.y) / v.scale }
  }

  // ── Zoom ────────────────────────────────────────────────────
  const applyZoom = useCallback((delta, px, py) => {
    setVt(v => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (1 + delta)))
      const r = s / v.scale
      return { scale: s, x: px - r * (px - v.x), y: py - r * (py - v.y) }
    })
  }, [])

  const zoomIn  = useCallback(() => { const r = containerRef.current?.getBoundingClientRect(); if (r) applyZoom( ZOOM_STEP, r.width/2, r.height/2) }, [applyZoom])
  const zoomOut = useCallback(() => { const r = containerRef.current?.getBoundingClientRect(); if (r) applyZoom(-ZOOM_STEP, r.width/2, r.height/2) }, [applyZoom])

  const fitToScreen = useCallback(() => {
    const s = stateRef.current
    if (!containerRef.current) return
    if (s.nodes.length === 0) { setVt({ x: 40, y: 40, scale: 1 }); return }
    const rect = containerRef.current.getBoundingClientRect()
    const xs = s.nodes.flatMap(n => [n.x - n.width / 2, n.x + n.width / 2])
    const ys = s.nodes.flatMap(n => [n.y, n.y + n.height])
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const pad = 80
    const sc = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
      Math.min((rect.width - pad * 2) / (maxX - minX || 1), (rect.height - pad * 2) / (maxY - minY || 1))
    ))
    setVt({ scale: sc, x: (rect.width - (minX + maxX) * sc) / 2, y: (rect.height - (minY + maxY) * sc) / 2 })
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        const st = stateRef.current
        const ids = st.selectedNodeIds.length > 0 ? st.selectedNodeIds
          : st.selectedNodeId ? [st.selectedNodeId] : []
        if (ids.length > 0) copyNodes(ids)
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault(); pasteNodes(); return
      }
      switch (e.key) {
        case 'v': case 'V': setMode('select'); break
        case 'h': case 'H': setMode('pan'); break
        case 'c': case 'C': setMode('connect'); break
        case 'f': case 'F': fitToScreen(); break
        case '=': case '+': zoomIn(); break
        case '-': zoomOut(); break
        case 'Escape': setConnectFrom(null); setTempLine(null); break
        case 'Delete': case 'Backspace':
          if (!e.repeat) {
            const st = stateRef.current
            if (st.selectedNodeIds.length > 0) {
              deleteNodes(st.selectedNodeIds)
            } else if (st.selectedNodeId) {
              deleteNode(st.selectedNodeId)
            } else if (st.selectedEdgeId) {
              deleteEdge(st.selectedEdgeId)
            }
          }
          break
        case 'z': case 'Z':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
          break
        case 'y': case 'Y':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo() }
          break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitToScreen, zoomIn, zoomOut, deleteNode, deleteEdge, deleteNodes, undo, redo, copyNodes, pasteNodes])

  // ── Mouse wheel zoom ─────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const handler = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      applyZoom(-e.deltaY * 0.001, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [applyZoom])

  // ── Drop ────────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('nodeType')
    const name = e.dataTransfer.getData('nodeDefaultName') || '新节点'
    if (!type) return
    const pos = screenToCanvas(e.clientX, e.clientY)
    addNode({ id: `node_${Date.now()}`, type, name, x: pos.x, y: pos.y, width: type === 'gate' ? 56 : 120, height: type === 'gate' ? 56 : 60 })
  }, [addNode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Container mousedown ──────────────────────────────────────
  const onContainerMouseDown = useCallback((e) => {
    // Always close context menu on any mousedown on the canvas
    setCtxMenu(null)
    const m = modeRef.current
    // Right-click: start pan AND record timing for contextmenu gate
    if (e.button === 2) {
      e.preventDefault()
      rightClickRef.current = { startTime: Date.now(), moved: false, startX: e.clientX, startY: e.clientY }
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: vtRef.current.x, ty: vtRef.current.y, fromRight: true }
      return
    }
    if (e.button === 1 || m === 'pan') {
      e.preventDefault()
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: vtRef.current.x, ty: vtRef.current.y }
      return
    }
    if (e.button === 0 && m === 'select') {
      // Start lasso on empty space
      const pos = screenToCanvas(e.clientX, e.clientY)
      lassoRef.current = { startX: pos.x, startY: pos.y }
      setLasso({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
      deselect()
    }
    if (e.button === 0 && m === 'connect') { setConnectFrom(null); setTempLine(null) }
  }, [deselect]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Node mousedown ───────────────────────────────────────────
  const onNodeMouseDown = useCallback((e, node) => {
    if (e.button !== 0) return
    e.stopPropagation()
    // Cancel any lasso that might have started from container
    lassoRef.current = null; setLasso(null)
    if (modeRef.current !== 'select') return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const v = vtRef.current
    const pos = { x: (e.clientX - rect.left - v.x) / v.scale, y: (e.clientY - rect.top - v.y) / v.scale }
    const st = stateRef.current
    if (st.selectedNodeIds.length > 1 && st.selectedNodeIds.includes(node.id)) {
      // Multi-drag: capture start positions of all selected nodes
      const startPositions = {}
      st.selectedNodeIds.forEach(id => {
        const n = st.nodes.find(nn => nn.id === id)
        if (n) startPositions[id] = { x: n.x, y: n.y }
      })
      draggingMulti.current = { ids: st.selectedNodeIds, startClientX: e.clientX, startClientY: e.clientY, startPositions, notifiedDragStart: false }
    } else {
      draggingNode.current = { nodeId: node.id, offsetX: pos.x - node.x, offsetY: pos.y - node.y, notifiedDragStart: false }
      selectNode(node.id)
    }
  }, [selectNode])

  // ── Node click ───────────────────────────────────────────────
  const onNodeClick = useCallback((node, e) => {
    const m = modeRef.current
    if (m === 'select') { selectNode(node.id); return }
    if (m === 'pan') return
    if (m === 'connect') {
      const cf = connectFromRef.current
      if (!cf) {
        // basicEvent cannot be a parent (it has no children in a fault tree)
        if (node.type === 'basicEvent') { message.warning('基本事件不能作为父节点（无子节点）'); return }
        setConnectFrom(node.id)
        setTempLine({ x1: node.x, y1: node.y + node.height, x2: node.x, y2: node.y + node.height })
      } else {
        if (cf === node.id) { setConnectFrom(null); setTempLine(null); return }
        // topEvent cannot be a child (it's always the root)
        if (node.type === 'topEvent') { message.warning('顶事件不能作为子节点'); return }
        // Cycle detection: check if 'cf' is already reachable from 'node' (would form a cycle)
        const st = stateRef.current
        const visited = new Set()
        const queue = [node.id]
        while (queue.length) {
          const cur = queue.shift()
          if (cur === cf) { message.error('不能创建循环连线（会形成环路）'); return }
          if (visited.has(cur)) continue
          visited.add(cur)
          st.edges.filter(ed => ed.from === cur).forEach(ed => queue.push(ed.to))
        }
        addEdge({ id: `e_${Date.now()}`, from: cf, to: node.id })
        setConnectFrom(null); setTempLine(null)
        message.success('连线创建成功')
      }
    }
  }, [selectNode, addEdge])

  // ── Context menu ─────────────────────────────────────────────
  const onContainerContextMenu = useCallback((e) => {
    e.preventDefault()
    // If right-click was used to pan (moved > 5px or held > 280ms), suppress menu
    const rc = rightClickRef.current
    rightClickRef.current = null
    if (rc) {
      const elapsed = Date.now() - rc.startTime
      const dx = Math.abs(e.clientX - rc.startX)
      const dy = Math.abs(e.clientY - rc.startY)
      if (rc.moved || elapsed > 280 || dx > 5 || dy > 5) return
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, type: 'canvas', targetId: null })
  }, [])

  const onNodeContextMenu = useCallback((e, node) => {
    const st = stateRef.current
    if (st.selectedNodeIds.length > 1 && st.selectedNodeIds.includes(node.id)) {
      setCtxMenu({ x: e.clientX, y: e.clientY, type: 'node-multi', targetId: node.id })
    } else {
      selectNode(node.id)
      setCtxMenu({ x: e.clientX, y: e.clientY, type: 'node', targetId: node.id })
    }
  }, [selectNode])

  // HTML5 drag start from canvas node — we PREVENT default to stop the browser's
  // native drag API from taking over (it blocks mousemove/mouseup on window).
  // Drag-to-delete is handled via mouse-position check in handleMouseUp instead.
  const onNodeDragStart = useCallback((e, node) => {
    e.preventDefault()  // block native HTML5 drag
  }, [])

  // Edge midpoint drag start
  const onEdgeMidMouseDown = useCallback((e, edgeId, bx, by) => {
    draggingEdgeMid.current = { edgeId, startBx: bx, startBy: by, startClientX: e.clientX, startClientY: e.clientY }
  }, [])

  const onEdgeContextMenu = useCallback((e, edgeId) => {
    selectEdge(edgeId)
    setCtxMenu({ x: e.clientX, y: e.clientY, type: 'edge', targetId: edgeId })
  }, [selectEdge])

  // ── Window-level mouse move / up — infinite canvas ──────────
  // Attaching to window instead of the div means dragging/panning
  // continues even when the cursor leaves the canvas boundary.
  useEffect(() => {
    function handleMouseMove(e) {
      // Edge midpoint drag
      if (draggingEdgeMid.current) {
        const { edgeId, startBx, startBy, startClientX, startClientY } = draggingEdgeMid.current
        const v = vtRef.current
        const dx = (e.clientX - startClientX) / v.scale
        const dy = (e.clientY - startClientY) / v.scale
        updateEdge(edgeId, { bendX: startBx + dx, bendY: startBy + dy })
        return
      }
      // Multi-node drag
      if (draggingMulti.current) {
        const { ids, startClientX, startClientY, startPositions } = draggingMulti.current
        const v = vtRef.current
        const dx = (e.clientX - startClientX) / v.scale
        const dy = (e.clientY - startClientY) / v.scale
        if (!draggingMulti.current.notifiedDragStart && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          draggingMulti.current.notifiedDragStart = true
          window.dispatchEvent(new CustomEvent('canvasNodeDragStart'))
        }
        ids.forEach(id => {
          const sp = startPositions[id]
          if (sp) moveNode(id, sp.x + dx, sp.y + dy)
        })
        return
      }
      // Single-node drag
      if (draggingNode.current) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const v = vtRef.current
        const pos = { x: (e.clientX - rect.left - v.x) / v.scale, y: (e.clientY - rect.top - v.y) / v.scale }
        const { nodeId, offsetX, offsetY } = draggingNode.current
        if (!draggingNode.current.notifiedDragStart) {
          const nx = pos.x - offsetX, ny = pos.y - offsetY
          const nd = stateRef.current.nodes.find(n => n.id === nodeId)
          if (nd && (Math.abs(nx - nd.x) > 3 || Math.abs(ny - nd.y) > 3)) {
            draggingNode.current.notifiedDragStart = true
            window.dispatchEvent(new CustomEvent('canvasNodeDragStart'))
          }
        }
        moveNode(nodeId, pos.x - offsetX, pos.y - offsetY)
        return
      }
      if (panRef.current) {
        const dx = e.clientX - panRef.current.startX
        const dy = e.clientY - panRef.current.startY
        // Mark right-click pan as "moved" once threshold exceeded
        if (panRef.current.fromRight && rightClickRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          rightClickRef.current.moved = true
        }
        const { tx, ty } = panRef.current  // captured before async setState
        setVt(v => ({ ...v, x: tx + dx, y: ty + dy }))
        return
      }
      // Lasso update
      if (lassoRef.current) {
        const pos = screenToCanvas(e.clientX, e.clientY) // eslint-disable-line react-hooks/exhaustive-deps
        lassoRef.current.endX = pos.x
        lassoRef.current.endY = pos.y
        setLasso({ x1: lassoRef.current.startX, y1: lassoRef.current.startY, x2: pos.x, y2: pos.y })
        return
      }
      if (connectFromRef.current) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const v = vtRef.current
        const pos = { x: (e.clientX - rect.left - v.x) / v.scale, y: (e.clientY - rect.top - v.y) / v.scale }
        const fromNode = stateRef.current.nodes.find(n => n.id === connectFromRef.current)
        if (fromNode) setTempLine({ x1: fromNode.x, y1: fromNode.y + fromNode.height, x2: pos.x, y2: pos.y })
      }
    }
    function handleMouseUp(e) {
      if (draggingEdgeMid.current) {
        draggingEdgeMid.current = null
        panRef.current = null
        return
      }
      if (draggingMulti.current) {
        draggingMulti.current = null
        commitMove()  // reuse COMMIT_MOVE to push history
        window.dispatchEvent(new CustomEvent('canvasNodeDragEnd'))
        panRef.current = null
        return
      }
      if (draggingNode.current) {
        const nodeId = draggingNode.current.nodeId
        draggingNode.current = null
        // Drag-to-delete: if mouse released over NodePalette zone (left panel ~208px wide)
        if (e.clientX < 210) {
          deleteNode(nodeId)
        } else {
          commitMove()
        }
        window.dispatchEvent(new CustomEvent('canvasNodeDragEnd'))
        panRef.current = null
        return
      }
      if (lassoRef.current) {
        const lr = lassoRef.current
        const minX = Math.min(lr.startX, lr.endX ?? lr.startX)
        const maxX = Math.max(lr.startX, lr.endX ?? lr.startX)
        const minY = Math.min(lr.startY, lr.endY ?? lr.startY)
        const maxY = Math.max(lr.startY, lr.endY ?? lr.startY)
        const selectedIds = stateRef.current.nodes
          .filter(n => {
            const nl = n.x - n.width / 2, nr = n.x + n.width / 2
            const nt = n.y, nb = n.y + n.height
            return nr > minX && nl < maxX && nb > minY && nt < maxY
          })
          .map(n => n.id)
        if (selectedIds.length > 0) selectNodes(selectedIds)
        lassoRef.current = null
        setLasso(null)
        panRef.current = null
        return
      }
      lassoRef.current = null
      setLasso(null)
      panRef.current = null
      // Fallback: ensure palette drop-zone is hidden
      window.dispatchEvent(new CustomEvent('canvasNodeDragEnd'))
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [moveNode, commitMove, updateEdge, deleteNode, selectNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  const nodeMap = {}
  state.nodes.forEach(n => { nodeMap[n.id] = n })

  // Build children map (from→[to]) for hasChildren and hidden computation
  const childrenMap = useMemo(() => {
    const map = {}
    state.edges.forEach(e => {
      if (!map[e.from]) map[e.from] = []
      map[e.from].push(e.to)
    })
    return map
  }, [state.edges])

  // Compute hidden node IDs: all transitive descendants of collapsed nodes
  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set()
    if (collapsedNodes.size === 0) return hidden
    function collectDescendants(nodeId) {
      const children = childrenMap[nodeId] || []
      children.forEach(childId => {
        if (!hidden.has(childId)) {
          hidden.add(childId)
          collectDescendants(childId)
        }
      })
    }
    collapsedNodes.forEach(nodeId => collectDescendants(nodeId))
    return hidden
  }, [childrenMap, collapsedNodes])

  const visibleNodes = useMemo(
    () => state.nodes.filter(n => !hiddenNodeIds.has(n.id)),
    [state.nodes, hiddenNodeIds]
  )
  const visibleEdges = useMemo(
    () => state.edges.filter(e => !hiddenNodeIds.has(e.from) && !hiddenNodeIds.has(e.to)),
    [state.edges, hiddenNodeIds]
  )

  // Listen for multi-delete event from ContextMenu
  useEffect(() => {
    const handler = (e) => { deleteNodes(e.detail) }
    document.addEventListener('deleteMulti', handler)
    return () => document.removeEventListener('deleteMulti', handler)
  }, [deleteNodes])

  // Copy / paste callbacks
  const handleCopy = useCallback((ids) => { copyNodes(ids) }, [copyNodes])
  const handlePaste = useCallback(() => { pasteNodes() }, [pasteNodes])

  const cursor = panRef.current ? 'grabbing'
    : mode === 'pan' ? 'grab'
    : mode === 'connect' ? (connectFrom ? 'crosshair' : 'cell')
    : 'default'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 canvas-grid"
      style={{ cursor }}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onMouseDown={onContainerMouseDown}
      onContextMenu={onContainerContextMenu}
    >
      {/* SVG layer: edges + temp line + connection ports + lasso */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 5, overflow: 'visible', pointerEvents: 'none' }}>
        <g transform={`translate(${vt.x},${vt.y}) scale(${vt.scale})`}>
          {visibleEdges.map(edge => (
            <EdgePath key={edge.id} edge={edge} nodeMap={nodeMap}
              selected={state.selectedEdgeId === edge.id} onClick={selectEdge} onContextMenu={onEdgeContextMenu}
              onMidMouseDown={onEdgeMidMouseDown} />
          ))}

          {tempLine && (
            <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2}
              stroke="#1677ff" strokeWidth={2} strokeDasharray="6 4" />
          )}

          {lasso && (
            <rect
              x={Math.min(lasso.x1, lasso.x2)} y={Math.min(lasso.y1, lasso.y2)}
              width={Math.abs(lasso.x2 - lasso.x1)} height={Math.abs(lasso.y2 - lasso.y1)}
              fill="rgba(22,119,255,0.06)" stroke="#1677ff" strokeWidth={1 / vt.scale}
              strokeDasharray={`${4 / vt.scale} ${3 / vt.scale}`}
              pointerEvents="none"
            />
          )}

          {mode === 'connect' && visibleNodes.map(node => (
            <g key={`port-${node.id}`} style={{ pointerEvents: 'all' }}>
              <circle cx={node.x} cy={node.y} r={5}
                fill={hoveredNodeId === node.id ? '#1677ff' : '#fff'}
                stroke="#1677ff" strokeWidth={2} style={{ cursor: 'crosshair' }}
                onClick={e => { e.stopPropagation(); onNodeClick(node, e) }} />
              <circle cx={node.x} cy={node.y + node.height} r={5}
                fill={hoveredNodeId === node.id ? '#1677ff' : '#fff'}
                stroke="#1677ff" strokeWidth={2} style={{ cursor: 'crosshair' }}
                onClick={e => { e.stopPropagation(); onNodeClick(node, e) }} />
            </g>
          ))}
        </g>
      </svg>

      {/* HTML layer: nodes */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${vt.x}px,${vt.y}px) scale(${vt.scale})`, zIndex: 10 }}
      >
        {visibleNodes.map(node => (
          <FaultNode
            key={node.id} node={node}
            selected={state.selectedNodeId === node.id}
            multiSelected={state.selectedNodeIds.includes(node.id)}
            isConnectFrom={connectFrom === node.id}
            mode={mode}
            onMouseDown={onNodeMouseDown}
            onClick={onNodeClick}
            onContextMenu={onNodeContextMenu}
            onMouseEnter={setHoveredNodeId}
            onMouseLeave={() => setHoveredNodeId(null)}
            onDragStart={onNodeDragStart}
            hasChildren={!!(childrenMap[node.id] && childrenMap[node.id].length > 0)}
            isCollapsed={collapsedNodes.has(node.id)}
            onToggleCollapse={toggleCollapse}
          />
        ))}
      </div>

      {/* Empty state */}
      {state.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none" style={{ zIndex: 2 }}>
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <rect x="6" y="6" width="40" height="40" rx="10" stroke="#d1d5db" strokeWidth="2" fill="none" />
            <path d="M26 18v16M18 26h16" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-sm text-gray-400">从左侧拖入节点，或点击工具栏「加载示例」</p>
          <p className="mt-1 text-xs text-gray-300">快捷键：V 选择 · H 平移 · C 连线 · F 适应 · Del 删除</p>
        </div>
      )}

      {/* Mode hint */}
      {mode === 'connect' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1.5 rounded-full shadow pointer-events-none select-none" style={{ zIndex: 40 }}>
          {connectFrom ? '点击目标节点完成连接 · Esc 取消' : '点击父节点开始连线'}
        </div>
      )}

      {/* Bottom-right controls */}
      <CanvasControls mode={mode} setMode={setMode} scale={vt.scale}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fitToScreen} rightOffset={rightOffset} />

      <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)}
        state={state} deleteEdge={deleteEdge} deleteNode={deleteNode}
        onCopy={handleCopy} onPaste={handlePaste} />
    </div>
  )
}
