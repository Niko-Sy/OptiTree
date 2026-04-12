import { useMemo, useState } from 'react'
import {
  CheckOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function toItems(preview) {
  if (!preview || !Array.isArray(preview.items)) return []
  return preview.items
    .map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? item.id : '',
      nodeId: typeof item.nodeId === 'string' ? item.nodeId : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
      changeType: typeof item.changeType === 'string' ? item.changeType : 'update',
      confidence: Number.isFinite(item.confidence) ? item.confidence : 1,
    }))
    .filter((item) => item.id)
}

export default function HybridPreviewOverlay({
  pendingPreview,
  nodeMap,
  viewport,
  hiddenNodeIds,
  onApply,
  onDiscard,
}) {
  const callId = pendingPreview?.callId || ''
  const preview = pendingPreview?.preview || null
  const items = useMemo(() => toItems(preview), [preview])

  const [checkedIds, setCheckedIds] = useState(() => new Set(items.map((item) => item.id)))

  if (!preview || !items.length) return null

  const totalCount = Number.isFinite(preview.totalItems) ? preview.totalItems : items.length
  const checkedCount = checkedIds.size
  const viewportWidth = Number.isFinite(viewport?.width) ? viewport.width : 0
  const viewportHeight = Number.isFinite(viewport?.height) ? viewport.height : 0
  const zoom = Number.isFinite(viewport?.scale) ? viewport.scale : 1
  const tx = Number.isFinite(viewport?.x) ? viewport.x : 0
  const ty = Number.isFinite(viewport?.y) ? viewport.y : 0

  const renderedItems = items
    .map((item) => {
      const node = nodeMap[item.nodeId]
      if (!node) return null
      if (hiddenNodeIds?.has?.(item.nodeId)) return null

      const nodeLeft = tx + (node.x - node.width / 2) * zoom
      const nodeTop = ty + node.y * zoom
      const nodeWidth = node.width * zoom
      const nodeHeight = node.height * zoom
      const cardX = clamp(nodeLeft + nodeWidth + 10, 8, Math.max(8, viewportWidth - 288))
      const cardY = clamp(nodeTop - 8, 8, Math.max(8, viewportHeight - 74))

      return {
        item,
        nodeLeft,
        nodeTop,
        nodeWidth,
        nodeHeight,
        cardX,
        cardY,
      }
    })
    .filter(Boolean)

  const hiddenItemsCount = items.length - renderedItems.length

  const toggleOne = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setCheckedIds(new Set(items.map((item) => item.id)))
  }

  const clearAll = () => {
    setCheckedIds(new Set())
  }

  const handleApply = () => {
    if (!checkedIds.size) return
    onApply?.(Array.from(checkedIds), callId)
  }

  const lowConfidenceCount = items.filter((item) => item.confidence < 0.6).length

  return (
    <div className="agent-hybrid-overlay-root">
      <div className="agent-hybrid-overlay-mask" />

      {renderedItems.map(({ item, nodeLeft, nodeTop, nodeWidth, nodeHeight, cardX, cardY }) => {
        const checked = checkedIds.has(item.id)
        const confidenceDanger = item.confidence < 0.6

        return (
          <div key={item.id}>
            <div
              className={`agent-hybrid-node-ring ${checked ? 'checked' : ''}`}
              style={{
                left: nodeLeft,
                top: nodeTop,
                width: nodeWidth,
                height: nodeHeight,
                borderColor: checked ? '#1677ff' : '#94a3b8',
                boxShadow: checked
                  ? '0 0 0 3px rgba(22,119,255,0.25), 0 8px 20px rgba(22,119,255,0.2)'
                  : '0 0 0 1px rgba(148,163,184,0.35), 0 5px 12px rgba(15,23,42,0.12)',
              }}
            />

            <label
              className="agent-hybrid-item-pill"
              style={{
                left: cardX,
                top: cardY,
                borderColor: checked ? '#a7d3ff' : '#dbe3ee',
                background: checked
                  ? 'linear-gradient(135deg, rgba(238,247,255,0.96), rgba(255,255,255,0.98))'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(249,250,252,0.95))',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleOne(item.id)}
                style={{ marginTop: 1 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="agent-hybrid-item-title">
                  {item.changeType} · {item.nodeId || '-'}
                </div>
                <div className="agent-hybrid-item-reason">
                  {item.reason || '建议调整'}
                </div>
              </div>
              <span
                className="agent-hybrid-confidence"
                style={{
                  color: confidenceDanger ? '#d46b08' : '#0958d9',
                  background: confidenceDanger ? '#fff7e6' : '#e6f4ff',
                }}
              >
                {(item.confidence * 100).toFixed(0)}%
              </span>
            </label>
          </div>
        )
      })}

      <div className="agent-hybrid-confirmbar">
        <div className="agent-hybrid-bar-left">
          <div className="agent-hybrid-bar-title">
            <ThunderboltOutlined style={{ color: '#1677ff' }} />
            <span>{preview.summary || '预览变更已生成'}</span>
          </div>
          <div className="agent-hybrid-bar-meta">
            <span>已选 {checkedCount}/{totalCount}</span>
            {hiddenItemsCount > 0 && <span>有 {hiddenItemsCount} 项不在当前视野</span>}
            {lowConfidenceCount > 0 && (
              <span style={{ color: '#d46b08' }}>
                <WarningOutlined /> 低置信 {lowConfidenceCount} 项
              </span>
            )}
          </div>
        </div>

        <div className="agent-hybrid-bar-actions">
          <button type="button" className="agent-hybrid-ghost" onClick={selectAll}>全选</button>
          <button type="button" className="agent-hybrid-ghost" onClick={clearAll}>清空</button>
          <button type="button" className="agent-hybrid-cancel" onClick={() => onDiscard?.(callId)}>
            <CloseOutlined /> 放弃
          </button>
          <button
            type="button"
            className="agent-hybrid-apply"
            onClick={handleApply}
            disabled={checkedCount === 0}
          >
            <CheckOutlined /> 应用 ({checkedCount})
          </button>
        </div>
      </div>
    </div>
  )
}
