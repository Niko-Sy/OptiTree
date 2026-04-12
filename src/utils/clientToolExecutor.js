import { useAgentUIStore } from '../store/useAgentUIStore'
import { useEditorStore } from '../store/editorStore'

function asNodeIdList(nodeIds) {
  if (!Array.isArray(nodeIds)) return []
  return nodeIds.filter((id) => typeof id === 'string' && id.trim())
}

function emitCanvasEvent(name, detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

const CLIENT_TOOL_HANDLERS = {
  highlight_nodes: ({ nodeIds, color = 'primary', duration = 0 } = {}) => {
    const ids = asNodeIdList(nodeIds)
    if (!ids.length) return

    const colorMap = {
      primary: 'agent-primary',
      warning: 'agent-warning',
      error: 'agent-error',
    }
    const className = colorMap[color] || 'agent-primary'
    const store = useAgentUIStore.getState()
    store.setHighlight(ids, className)

    if (Number.isFinite(duration) && duration > 0) {
      setTimeout(() => {
        useAgentUIStore.getState().clearHighlight(ids)
      }, duration)
    }
  },

  locate_node: ({ nodeId, zoom = 1.2 } = {}) => {
    if (typeof nodeId !== 'string' || !nodeId) return
    const fitFn = useAgentUIStore.getState().fitNodeIntoView
    if (typeof fitFn === 'function') {
      fitFn(nodeId, zoom)
      return
    }
    emitCanvasEvent('agent:locate-node', { nodeId, zoom })
  },

  expand_subtree: ({ nodeId } = {}) => {
    if (typeof nodeId !== 'string' || !nodeId) return
    emitCanvasEvent('agent:expand-node', { nodeId })
  },

  collapse_subtree: ({ nodeId } = {}) => {
    if (typeof nodeId !== 'string' || !nodeId) return
    emitCanvasEvent('agent:collapse-node', { nodeId })
  },

  show_node_detail: ({ nodeId } = {}) => {
    if (typeof nodeId !== 'string' || !nodeId) return
    useEditorStore.getState().selectNode(nodeId)
    emitCanvasEvent('agent:show-node-detail', { nodeId })
  },

  preview_layout: ({ layout } = {}) => {
    useAgentUIStore.getState().setLayoutPreview(layout || null)
  },

  annotate_node: ({ nodeId, text, style = 'info' } = {}) => {
    if (typeof nodeId !== 'string' || !nodeId) return
    useAgentUIStore.getState().addAnnotation(nodeId, { text, style })
  },

  clear_annotations: () => {
    useAgentUIStore.getState().clearAllAnnotations()
  },
}

export function executeClientTool(toolName, args = {}) {
  const handler = CLIENT_TOOL_HANDLERS[toolName]
  if (!handler) {
    console.warn(`[AgentUI] Unknown client tool: ${toolName}`)
    return
  }

  try {
    handler(args)
  } catch (error) {
    console.error(`[AgentUI] Client tool failed: ${toolName}`, error)
  }
}
