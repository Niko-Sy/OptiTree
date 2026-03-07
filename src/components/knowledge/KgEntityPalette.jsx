/**
 * KgEntityPalette — 知识图谱左侧实体类型面板
 * 与 NodePalette.jsx 保持一致的折叠动画和宽度（208px）
 * 通过 HTML5 drag 协议向 KgCanvas 传递新节点类型
 */
import { useState } from 'react'
import { Tooltip, Divider } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'

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
  function handleDragStart(e, nodeType) {
    e.dataTransfer.setData('application/kg-node-type', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="absolute left-0 top-0 bottom-0 z-20 bg-white border-r border-gray-200 flex flex-col transition-all duration-200 overflow-hidden shadow-sm"
      style={{ width: collapsed ? 0 : 208 }}
    >
      {/* 折叠按钮 */}
      <button
        className="absolute -right-7 top-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-gray-200 rounded-r flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer z-30 shadow-sm"
        onClick={() => onCollapsedChange?.(!collapsed)}
        title={collapsed ? '展开面板' : '收起面板'}
      >
        {collapsed ? <RightOutlined style={{ fontSize: 10 }} /> : <LeftOutlined style={{ fontSize: 10 }} />}
      </button>

      <div className="px-3 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">实体类型</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {Object.entries(ENTITY_TYPES).map(([type, cfg]) => (
          <Tooltip key={type} title={cfg.description} placement="right">
            <div
              draggable
              onDragStart={e => handleDragStart(e, type)}
              className="flex items-center gap-2 p-2 rounded-lg cursor-grab hover:bg-gray-50 active:cursor-grabbing select-none transition-colors"
            >
              <div
                className="w-8 h-6 rounded border-2 flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: cfg.bg,
                  borderColor: cfg.border,
                  color: cfg.color,
                }}
              >
                {cfg.label[0]}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{cfg.label}</p>
              </div>
            </div>
          </Tooltip>
        ))}
      </div>

      <Divider style={{ margin: '4px 0' }} />

      {/* 快捷操作提示 */}
      <div className="px-3 pb-3 space-y-1">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">提示</p>
        <p className="text-xs text-gray-400">拖拽到画布创建节点</p>
        <p className="text-xs text-gray-400">双击画布空白区域</p>
        <p className="text-xs text-gray-400">拖拽节点端口连接</p>
      </div>
    </div>
  )
}
