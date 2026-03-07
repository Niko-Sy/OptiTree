// 节点库组件，显示可拖拽的节点类型列表，并处理从画布拖回删除的交互
import { useState, useEffect } from 'react'
import { GateSymbol, GATE_CONFIG } from './GateSymbol'
import { useEditorActions } from '../../store/useEditorStore'

const NODE_TYPES = [
  {
    type: 'topEvent',
    label: '顶事件',
    desc: '系统/子系统最顶层故障',
    shape: 'circle',
    color: '#4338ca', 
    bg: '#c7d2fe',
    defaultName: '顶事件',
  },
  {
    type: 'midEvent',
    label: '中间事件',
    desc: '可进一步展开的中间故障',
    shape: 'rect',
    color: '#0ea5e9',
    bg: '#e0f2fe',
    defaultName: '中间事件',
  },
  {
    type: 'basicEvent',
    label: '基本事件',
    desc: '不可再分的底层故障',
    shape: 'circle',
    color: '#059669',
    bg: '#d1fae5',
    defaultName: '基本事件',
  },
  {
    type: 'gate',
    label: 'OR 门',
    desc: '任意输入即触发输出',
    shape: 'gate',
    gateLabel: 'OR',
    defaultName: 'OR',
    ...GATE_CONFIG.OR,
  },
  {
    type: 'gate',
    label: 'AND 门',
    desc: '所有输入才触发输出',
    shape: 'gate',
    gateLabel: 'AND',
    defaultName: 'AND',
    ...GATE_CONFIG.AND,
  },
  {
    type: 'gate',
    label: 'NOT 门',
    desc: '输入取反后输出',
    shape: 'gate',
    gateLabel: 'NOT',
    defaultName: 'NOT',
    ...GATE_CONFIG.NOT,
  },
]

function NodeIcon({ shape, color, bg, gateLabel }) {
  if (shape === 'gate') {
    const cfg = GATE_CONFIG[gateLabel] ?? GATE_CONFIG.OR
    return (
      <div
        className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
        style={{ background: cfg.bg, border: `2px solid ${cfg.color}` }}
      >
        <GateSymbol gateLabel={gateLabel} size={28} />
      </div>
    )
  }
  if (shape === 'circle') {
    return (
      <div
        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
        style={{ background: bg, border: `2px solid ${color}` }}
      />
    )
  }
  if (shape === 'diamond') {
    return (
      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
        <div
          className="w-5 h-5 rotate-45"
          style={{ background: bg, border: `2px solid ${color}` }}
        />
      </div>
    )
  }
  // rect
  return (
    <div
      className="w-8 h-8 rounded shrink-0"
      style={{ background: bg, border: `2px solid ${color}` }}
    />
  )
}

export default function NodePalette() {
  const { deleteNode } = useEditorActions()
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const [dropTarget, setDropTarget] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Listen for canvas node drag start/end events
  useEffect(() => {
    const onStart = () => setIsDraggingCanvas(true)
    const onEnd   = () => { setIsDraggingCanvas(false); setDropTarget(false) }
    const onMouseUp = () => { setIsDraggingCanvas(false); setDropTarget(false) }
    window.addEventListener('canvasNodeDragStart', onStart)
    window.addEventListener('canvasNodeDragEnd', onEnd)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('canvasNodeDragStart', onStart)
      window.removeEventListener('canvasNodeDragEnd', onEnd)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function onDragStart(e, nodeType) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('nodeType', nodeType.type)
    e.dataTransfer.setData('nodeDefaultName', nodeType.defaultName)
  }

  function onPaletteDragOver(e) {
    if (e.dataTransfer.types.includes('canvasnodeid')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(true)
    }
  }
  function onPaletteDrop(e) {
    const nodeId = e.dataTransfer.getData('canvasNodeId')
    if (nodeId) {
      e.preventDefault()
      deleteNode(nodeId)
      setIsDraggingCanvas(false)
      setDropTarget(false)
    }
  }
  function onPaletteDragLeave() { setDropTarget(false) }

  return (
    <div
      className="absolute left-0 top-0 bottom-0 z-20 bg-white/70 backdrop-blur-sm border-r border-gray-200 flex flex-col transition-all duration-200"
      style={{ width: collapsed ? 0 : 208 }}
      onDragOver={onPaletteDragOver}
      onDrop={onPaletteDrop}
      onDragLeave={onPaletteDragLeave}
    >
      {/* Floating toggle button — protrudes from right edge */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? '展开节点库' : '收起节点库'}
        style={{
          position: 'absolute',
          right: collapsed ? 0 : 10,
          top: '50%',
          transform: 'translate(100%, -50%)',
          zIndex: 30,
          outline: 'none',
        }}
        className="w-6 h-6 flex items-center justify-center rounded-full
          bg-white/70 backdrop-blur-sm border border-gray-300
          text-gray-800 hover:text-blue-500 hover:bg-blue-50
          transition-colors cursor-pointer select-none"
      >
        <svg width="8" height="8" viewBox="0 0 10 14" fill="none">
          {collapsed
            ? <path d="M2 2l6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            : <path d="M8 2L2 7l6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          }
        </svg>
      </button>

      {/* Panel content — hidden when collapsed */}
      {!collapsed && (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <div className="px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">节点类型库</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {NODE_TYPES.map(nt => (
              <div
                key={nt.gateLabel || nt.type}
                draggable
                onDragStart={e => onDragStart(e, nt)}
                className="flex items-center gap-3 p-2.5 bg-white border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-sm transition-all select-none"
              >
                <NodeIcon shape={nt.shape} color={nt.color} bg={nt.bg} gateLabel={nt.gateLabel} />
                <div>
                  <p className="text-sm font-medium text-gray-800 leading-tight">{nt.label}</p>
                  <p className="text-xs text-gray-400 leading-tight mt-0.5">{nt.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Drop-to-delete zone shown while dragging a canvas node */}
          {isDraggingCanvas && (
            <div
              className={[
                'absolute inset-0 flex flex-col items-center justify-center gap-2 transition-colors rounded pointer-events-none z-10',
                dropTarget ? 'bg-red-100 border-2 border-red-400' : 'bg-red-50 border-2 border-dashed border-red-300',
              ].join(' ')}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke={dropTarget ? '#dc2626' : '#f87171'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className={`text-xs font-semibold ${dropTarget ? 'text-red-600' : 'text-red-400'}`}>
                {dropTarget ? '松开以删除' : '拖至此处删除节点'}
              </span>
            </div>
          )}

          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400 text-center">拖拽节点到画布</p>
          </div>
        </div>
      )}

    </div>
  )
}
