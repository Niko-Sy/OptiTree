import { Button, Tooltip } from 'antd'
import { MinusOutlined, PlusOutlined } from '@ant-design/icons'

export const MIN_VIEWER_ZOOM = 0.6
export const MAX_VIEWER_ZOOM = 2.2
export const VIEWER_ZOOM_STEP = 0.1

export function clampViewerZoomLevel(level, min = MIN_VIEWER_ZOOM, max = MAX_VIEWER_ZOOM) {
  const numericLevel = Number(level)
  if (!Number.isFinite(numericLevel)) return 1
  return Math.max(min, Math.min(max, Number(numericLevel.toFixed(2))))
}

export function buildViewerZoomStyle(level) {
  const safeLevel = clampViewerZoomLevel(level)
  if (Math.abs(safeLevel - 1) < 0.001) return undefined

  return {
    transform: `scale(${safeLevel})`,
    transformOrigin: 'top center',
    width: `${(100 / safeLevel).toFixed(2)}%`,
  }
}

export default function ViewerZoomControls({
  zoomLevel = 1,
  onZoomChange,
  min = MIN_VIEWER_ZOOM,
  max = MAX_VIEWER_ZOOM,
  step = VIEWER_ZOOM_STEP,
}) {
  const safeZoomLevel = clampViewerZoomLevel(zoomLevel, min, max)
  const zoomText = `${Math.round(safeZoomLevel * 100)}%`
  const canZoomOut = safeZoomLevel > min + 0.001
  const canZoomIn = safeZoomLevel < max - 0.001

  function applyDelta(delta) {
    onZoomChange?.((current) => clampViewerZoomLevel(Number(current || 1) + delta, min, max))
  }

  return (
    <div className="document-reader-zoom-controls" role="group" aria-label="阅读器缩放控件">
      <Tooltip title="缩小">
        <Button
          type="text"
          size="small"
          icon={<MinusOutlined />}
          disabled={!canZoomOut}
          onClick={() => applyDelta(-step)}
          aria-label="缩小文档"
        />
      </Tooltip>
      <span className="document-reader-zoom-indicator" aria-live="polite">{zoomText}</span>
      <Tooltip title="放大">
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          disabled={!canZoomIn}
          onClick={() => applyDelta(step)}
          aria-label="放大文档"
        />
      </Tooltip>
    </div>
  )
}
