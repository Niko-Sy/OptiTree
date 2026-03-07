/**
 * KgEntityPalette — 知识图谱左侧实体类型面板
 * 与 NodePalette.jsx 保持一致的折叠动画和宽度（208px）
 * 通过 HTML5 drag 协议向 KgCanvas 传递新节点类型
 * 支持将画布节点拖入面板以删除（垃圾桶区域）
 */
import { useState, useEffect } from 'react'
import { Tooltip, Divider } from 'antd'
import { LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons'
import { useKnowledgeActions } from '../../store/useKnowledgeStore'

// ─── 实体类型配置 ─────────────────────────────────────────────────
export const ENTITY_TYPES = {
  entityNode: {
    label: '实体节点',
    description: '设备/部件/系统等物理或逻辑实体',
    bg: '#ede9fe',
    border: '#7c3aed',
    color: '#4c1d95',
    shape: 'rect',
  },
  eventNode: {
    label: '事件节点',
    description: '故障事件或状态变化',
    bg: '#e0f2fe',
    border: '#0ea5e9',
    color: '#075985',
    shape: 'rect',
  },
  componentNode: {
    label: '组件节点',
    description: '子系统或功能模块',
    bg: '#d1fae5',
    border: '#059669',
    color: '#064e3b',
    shape: 'rect',
  },
  causeNode: {
    label: '原因节点',
    description: '根本原因或诱因',
    bg: '#fff7ed',
    border: '#ea580c',
    color: '#7c2d12',
    shape: 'rect',
  },
}

export default function KgEntityPalette({ collapsed, onCollapsedChange }) {
  const { deleteNode } = useKnowledgeActions()
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const [isDropTarget, setIsDropTarget] = useState(false)

  // 监听画布节点拖拽事件（由 KgCanvas 派发）
  useEffect(() => {
    const onStart = () => setIsDraggingCanvas(true)
    const onEnd   = () => { setIsDraggingCanvas(false); setIsDropTarget(false) }
    const onOver  = (e) => setIsDropTarget(e.detail?.over ?? false)
    window.addEventListener('kgNodeDragStart',   onStart)
    window.addEventListener('kgNodeDragEnd',     onEnd)
    window.addEventListener('kgNodeOverPalette', onOver)
    window.addEventListener('mouseup',           onEnd)
    return () => {
      window.removeEventListener('kgNodeDragStart',   onStart)
      window.removeEventListener('kgNodeDragEnd',     onEnd)
      window.removeEventListener('kgNodeOverPalette', onOver)
      window.removeEventListener('mouseup',           onEnd)
    }
  }, [])

  function handleDragStart(e, nodeType) {
    e.dataTransfer.setData('application/kg-node-type', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  // 接收从画布拖入的节点（删除）
  function onPaletteDragOver(e) {
    if (e.dataTransfer.types.includes('kgnodeid')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDropTarget(true)
    }
  }
  function onPaletteDrop(e) {
    const nodeId = e.dataTransfer.getData('kgNodeId')
    if (nodeId) {
      e.preventDefault()
      deleteNode(nodeId)
    }
    setIsDraggingCanvas(false)
    setIsDropTarget(false)
  }
  function onPaletteDragLeave() { setIsDropTarget(false) }

  const panelWidth = 208

  return (
    // 外层 wrapper：不裁剪内容，用于让折叠按钮始终可见
    <div
      className="absolute left-0 top-0 bottom-0 z-20"
      style={{ width: 0, pointerEvents: 'none' }}
    >
      {/* 主面板内容 */}
      <div
        className="absolute left-0 top-0 bottom-0 bg-white/70 backdrop-blur-sm border-r border-gray-200 flex flex-col transition-all duration-200 overflow-hidden shadow-sm"
        style={{ width: collapsed ? 0 : panelWidth, pointerEvents: 'auto' }}
        onDragOver={onPaletteDragOver}
        onDrop={onPaletteDrop}
        onDragLeave={onPaletteDragLeave}
      >
        <div className="px-3 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">实体类型</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {Object.entries(ENTITY_TYPES).map(([type, cfg]) => (
            <Tooltip key={type} title={cfg.description} placement="right">
              <div
                draggable
                onDragStart={e => handleDragStart(e, type)}
                className="flex items-center gap-1 px-2 py-3 rounded-lg border-1 border-gray-200 cursor-grab bg-white hover:border-blue-400 active:cursor-grabbing select-none transition-colors"
              >
                <div
                  className="ml-1 w-10 h-8 rounded border-2 flex items-center justify-center text-xs font-bold shrink-0 "
                  style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}
                >
                  {cfg.label[0]}
                </div>
                <div className="min-w-0 ml-2">
                  <p className="text-md font-medium text-gray-700 truncate">{cfg.label}</p>
                </div>
              </div>
            </Tooltip>
          ))}
        </div>

        {/* 拖入删除区：拖拽画布节点时高亮显示 */}
        {isDraggingCanvas && !collapsed && (
          <div
            className={`mx-2 mb-2 rounded-lg border-2 border-dashed flex items-center justify-center gap-1 py-3 transition-colors ${
              isDropTarget
                ? 'bg-red-50 border-red-400 text-red-500'
                : 'bg-gray-50 border-gray-300 text-gray-400'
            }`}
          >
            <DeleteOutlined style={{ fontSize: 14 }} />
            <span className="text-xs select-none">拖入此处删除</span>
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        <div className="px-3 pb-3 space-y-1">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">提示</p>
          <p className="text-xs text-gray-400">拖拽到画布创建节点</p>
          <p className="text-xs text-gray-400">双击画布空白区域</p>
          <p className="text-xs text-gray-400">拖拽节点端口连接</p>
        </div>
      </div>

      {/* 折叠/展开按钮 — 始终可见，跟随面板右边缘 */}
      <button
        className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer shadow-sm transition-all duration-200"
        style={{ left: collapsed ? 0 : panelWidth-10, pointerEvents: 'auto' }}
        onClick={() => onCollapsedChange?.(!collapsed)}
        title={collapsed ? '展开面板' : '收起面板'}
      >
        {collapsed ? <RightOutlined style={{ fontSize: 10 }} /> : <LeftOutlined style={{ fontSize: 10 }} />}
      </button>
    </div>
  )
}
