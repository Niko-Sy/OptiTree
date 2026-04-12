import { create } from 'zustand'

function normalizeNodeIds(nodeIds) {
  if (!Array.isArray(nodeIds)) return []
  return nodeIds.filter((id) => typeof id === 'string' && id.trim())
}

function normalizeHighlightClass(className) {
  if (className === 'agent-warning' || className === 'agent-error') {
    return className
  }
  return 'agent-primary'
}

export const useAgentUIStore = create((set) => ({
  chatMode: 'ask',
  setChatMode: (mode) => set({ chatMode: mode === 'agent' ? 'agent' : 'ask' }),

  activeSessionId: null,
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId || null }),

  agentState: 'idle',
  setAgentState: (agentState) => set({ agentState: agentState || 'idle' }),

  pendingConfirm: null,
  setPendingConfirm: (pendingConfirm) => set({ pendingConfirm: pendingConfirm || null }),
  clearPendingConfirm: () => set({ pendingConfirm: null }),

  pendingPreview: null,
  setPendingPreview: (pendingPreview) => set({ pendingPreview: pendingPreview || null }),
  clearPendingPreview: () => set({ pendingPreview: null }),

  pendingIteration: null,
  setPendingIteration: (pendingIteration) => set({ pendingIteration: pendingIteration || null }),
  clearPendingIteration: () => set({ pendingIteration: null }),

  highlightMap: {},
  setHighlight: (nodeIds, className = 'agent-primary') => {
    const ids = normalizeNodeIds(nodeIds)
    if (!ids.length) return
    const nextClassName = normalizeHighlightClass(className)
    set((state) => {
      const nextMap = { ...state.highlightMap }
      ids.forEach((id) => {
        nextMap[id] = nextClassName
      })
      return { highlightMap: nextMap }
    })
  },
  clearHighlight: (nodeIds) => {
    const ids = normalizeNodeIds(nodeIds)
    if (!ids.length) {
      set({ highlightMap: {} })
      return
    }
    set((state) => {
      const nextMap = { ...state.highlightMap }
      ids.forEach((id) => {
        delete nextMap[id]
      })
      return { highlightMap: nextMap }
    })
  },

  annotations: {},
  addAnnotation: (nodeId, annotation = {}) => {
    if (typeof nodeId !== 'string' || !nodeId) return
    set((state) => ({
      annotations: {
        ...state.annotations,
        [nodeId]: {
          text: typeof annotation.text === 'string' ? annotation.text : '',
          style: annotation.style || 'info',
        },
      },
    }))
  },
  clearAllAnnotations: () => set({ annotations: {} }),

  layoutPreview: null,
  setLayoutPreview: (layoutPreview) => set({ layoutPreview: layoutPreview || null }),
  clearLayoutPreview: () => set({ layoutPreview: null }),

  fitNodeIntoView: null,
  registerFitNodeIntoView: (fitNodeIntoView) => set({
    fitNodeIntoView: typeof fitNodeIntoView === 'function' ? fitNodeIntoView : null,
  }),

  resetAgentUiState: () => set({
    activeSessionId: null,
    agentState: 'idle',
    pendingConfirm: null,
    pendingPreview: null,
    pendingIteration: null,
    highlightMap: {},
    annotations: {},
    layoutPreview: null,
  }),
}))
