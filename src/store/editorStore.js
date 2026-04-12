// Zustand-based editor store — replaces useEditorStore's useReducer for fine-grained subscriptions.
// All action names and state shape are identical to the previous implementation to minimise diffs.
import { create } from 'zustand'
import { shallow } from 'zustand/shallow'

export { shallow }

// ─── Helpers ──────────────────────────────────────────────────────
function snapshot(nodes, edges) {
  return JSON.stringify({ nodes, edges })
}

function pushHistory(state) {
  const snap = snapshot(state.nodes, state.edges)
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(snap)
  return { history: newHistory, historyIndex: newHistory.length - 1 }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asId(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function normalizeRevision(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null
}

// ─── Store ────────────────────────────────────────────────────────
export const useEditorStore = create((set) => ({
  // ── State shape (identical to old store) ──────────────────────
  nodes: [],
  edges: [],
  layoutType: 'vertical',
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNodeIds: [],
  clipboard: null,
  history: [],
  historyIndex: -1,
  aiIssues: [],
  revision: null,

  // ── Actions ───────────────────────────────────────────────────

  setGraph: (nodes, edges) => set(state => {
    const next = { nodes, edges, selectedNodeId: null, aiIssues: [] }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  setRevision: (revision) => set({ revision: normalizeRevision(revision) }),

  // 静默更新位置和连线锚点，不写入撤销历史（用于折叠/展开后自动重排）
  updateGraphSilent: (nodes, edges) => set(() => ({ nodes, edges })),

  // 统一应用 Agent 返回的图补丁（写入撤销历史）
  applyGraphPatch: (patch) => set((state) => {
    const upsertNodes = asArray(patch?.upsertNodes)
    const deleteNodes = asArray(patch?.deleteNodes)
    const upsertEdges = asArray(patch?.upsertEdges)
    const deleteEdges = asArray(patch?.deleteEdges)

    if (!upsertNodes.length && !deleteNodes.length && !upsertEdges.length && !deleteEdges.length) {
      return {}
    }

    const deletedNodeIdSet = new Set(
      deleteNodes
        .map(item => (typeof item === 'object' && item ? asId(item.id) : asId(item)))
        .filter(Boolean)
    )

    const deletedEdgeIdSet = new Set(
      deleteEdges
        .map(item => (typeof item === 'object' && item ? asId(item.id) : asId(item)))
        .filter(Boolean)
    )

    const nodeMap = new Map()
    state.nodes.forEach((node) => {
      if (!deletedNodeIdSet.has(node.id)) {
        nodeMap.set(node.id, node)
      }
    })

    upsertNodes.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const id = asId(item.id)
      if (!id) return
      const prev = nodeMap.get(id)
      const type = item.type || prev?.type
      nodeMap.set(id, {
        ...(prev || {}),
        ...item,
        id,
        width: item.width ?? prev?.width ?? (type === 'gate' ? 56 : 120),
        height: item.height ?? prev?.height ?? (type === 'gate' ? 56 : 60),
      })
    })

    const nextNodes = Array.from(nodeMap.values())

    const edgeMap = new Map()
    state.edges.forEach((edge) => {
      if (deletedEdgeIdSet.has(edge.id)) return
      if (deletedNodeIdSet.has(edge.from) || deletedNodeIdSet.has(edge.to)) return
      edgeMap.set(edge.id, edge)
    })

    upsertEdges.forEach((item, index) => {
      if (!item || typeof item !== 'object') return
      const from = asId(item.from)
      const to = asId(item.to)
      if (!from || !to) return
      if (deletedNodeIdSet.has(from) || deletedNodeIdSet.has(to)) return

      const id = asId(item.id) || `e_patch_${Date.now()}_${index}`
      const prev = edgeMap.get(id)
      edgeMap.set(id, {
        ...(prev || {}),
        ...item,
        id,
        from,
        to,
      })
    })

    const nextEdges = Array.from(edgeMap.values()).filter((edge) => {
      return !deletedNodeIdSet.has(edge.from) && !deletedNodeIdSet.has(edge.to)
    })

    const selectedNodeId = deletedNodeIdSet.has(state.selectedNodeId) ? null : state.selectedNodeId
    const selectedNodeIds = state.selectedNodeIds.filter(id => !deletedNodeIdSet.has(id))
    const nextEdgeIdSet = new Set(nextEdges.map(edge => edge.id))
    const selectedEdgeId = (state.selectedEdgeId && nextEdgeIdSet.has(state.selectedEdgeId))
      ? state.selectedEdgeId
      : null

    const next = {
      nodes: nextNodes,
      edges: nextEdges,
      selectedNodeId,
      selectedNodeIds,
      selectedEdgeId,
    }

    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  setLayoutType: (layoutType) => set({ layoutType }),

  addNode: (node) => set(state => {
    const next = { nodes: [...state.nodes, node] }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  updateNode: (id, patch) => set(state => {
    const next = { nodes: state.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  // Silent move — history pushed on commitMove
  moveNode: (id, x, y) => set(state => ({
    nodes: state.nodes.map(n => n.id === id ? { ...n, x, y } : n),
  })),

  commitMove: () => set(state => pushHistory(state)),

  deleteNode: (id) => set(state => {
    const next = {
      nodes: state.nodes.filter(n => n.id !== id),
      edges: state.edges.filter(e => e.from !== id && e.to !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  addEdge: (edge) => set(state => {
    const exists = state.edges.some(e => e.from === edge.from && e.to === edge.to)
    if (exists) return {}
    const next = { edges: [...state.edges, edge] }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  // Edge bend update — silent (no history), use commitEdgeMove to push
  moveEdge: (id, patch) => set(state => ({
    edges: state.edges.map(e => e.id === id ? { ...e, ...patch } : e),
  })),

  commitEdgeMove: () => set(state => pushHistory(state)),

  // updateEdge now uses moveEdge+commitEdgeMove pattern, kept for backwards compat
  updateEdge: (id, patch) => set(state => {
    const next = { edges: state.edges.map(e => e.id === id ? { ...e, ...patch } : e) }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  deleteEdge: (id) => set(state => {
    const next = {
      edges: state.edges.filter(e => e.id !== id),
      selectedEdgeId: state.selectedEdgeId === id ? null : state.selectedEdgeId,
    }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null, selectedNodeIds: [] }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null, selectedNodeIds: [] }),

  deselect: () => set({ selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] }),

  selectNodes: (ids) => set({ selectedNodeIds: ids, selectedNodeId: null, selectedEdgeId: null }),

  deleteNodes: (ids) => set(state => {
    const idSet = new Set(ids)
    const next = {
      nodes: state.nodes.filter(n => !idSet.has(n.id)),
      edges: state.edges.filter(e => !idSet.has(e.from) && !idSet.has(e.to)),
      selectedNodeIds: [],
      selectedNodeId: null,
    }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  // Silent batch move
  moveNodes: (ids, dx, dy) => set(state => {
    const idSet = new Set(ids)
    return {
      nodes: state.nodes.map(n => idSet.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n),
    }
  }),

  commitMoveNodes: () => set(state => pushHistory(state)),

  copyNodes: (ids) => set(state => {
    const idSet = new Set(ids)
    const nodes = state.nodes.filter(n => idSet.has(n.id))
    const edges = state.edges.filter(e => idSet.has(e.from) && idSet.has(e.to))
    return { clipboard: { nodes, edges } }
  }),

  pasteNodes: () => set(state => {
    if (!state.clipboard) return {}
    const idMap = {}
    const ts = Date.now()
    const newNodes = state.clipboard.nodes.map((n, i) => {
      const newId = `${n.id}_cp${ts}_${i}`
      idMap[n.id] = newId
      return { ...n, id: newId, x: n.x + 30, y: n.y + 30 }
    })
    const newEdges = state.clipboard.edges.map((e, i) => ({
      ...e,
      id: `e_cp${ts}_${i}`,
      from: idMap[e.from],
      to: idMap[e.to],
    }))
    const next = {
      nodes: [...state.nodes, ...newNodes],
      edges: [...state.edges, ...newEdges],
      selectedNodeIds: newNodes.map(n => n.id),
      selectedNodeId: null,
    }
    return { ...next, ...pushHistory({ ...state, ...next }) }
  }),

  setAiIssues: (issues) => set({ aiIssues: issues }),

  undo: () => set(state => {
    if (state.historyIndex <= 0) return {}
    const idx = state.historyIndex - 1
    const { nodes, edges } = JSON.parse(state.history[idx])
    return { nodes, edges, historyIndex: idx, selectedNodeId: null, selectedEdgeId: null, aiIssues: [] }
  }),

  redo: () => set(state => {
    if (state.historyIndex >= state.history.length - 1) return {}
    const idx = state.historyIndex + 1
    const { nodes, edges } = JSON.parse(state.history[idx])
    return { nodes, edges, historyIndex: idx, selectedNodeId: null, selectedEdgeId: null, aiIssues: [] }
  }),
}))

// ─── Backwards-compatible Context API shim ─────────────────────────
// Keeps old  useEditorStore() → { state, dispatch }  callers working
// while new code can call useEditorStore(selector) directly.
import { createContext } from 'react'

const EditorContext = createContext(null)
export { EditorContext }

// Provider is a pass-through (Zustand is global), kept only to avoid
// removing the <EditorStoreProvider> wrapper in FaultTreeEditor.
export function EditorStoreProvider({ children }) {
  return children
}

// Legacy hook — returns { state, dispatch } so old components compile unchanged.
export function useEditorStoreLegacy() {
  const state = useEditorStore()
  // dispatch shim maps action type strings → store methods
  function dispatch(action) {
    const store = useEditorStore.getState()
    switch (action.type) {
      case 'SET_GRAPH':        return store.setGraph(action.nodes, action.edges)
      case 'SET_REVISION':     return store.setRevision(action.revision)
      case 'SET_LAYOUT_TYPE':  return store.setLayoutType(action.layoutType)
      case 'APPLY_GRAPH_PATCH': return store.applyGraphPatch(action.patch)
      case 'ADD_NODE':         return store.addNode(action.node)
      case 'UPDATE_NODE':      return store.updateNode(action.id, action.patch)
      case 'MOVE_NODE':        return store.moveNode(action.id, action.x, action.y)
      case 'COMMIT_MOVE':      return store.commitMove()
      case 'DELETE_NODE':      return store.deleteNode(action.id)
      case 'ADD_EDGE':         return store.addEdge(action.edge)
      case 'UPDATE_EDGE':      return store.updateEdge(action.id, action.patch)
      case 'DELETE_EDGE':      return store.deleteEdge(action.id)
      case 'SELECT_NODE':      return store.selectNode(action.id)
      case 'SELECT_EDGE':      return store.selectEdge(action.id)
      case 'DESELECT':         return store.deselect()
      case 'SELECT_NODES':     return store.selectNodes(action.ids)
      case 'DELETE_NODES':     return store.deleteNodes(action.ids)
      case 'MOVE_NODES':       return store.moveNodes(action.ids, action.dx, action.dy)
      case 'COMMIT_MOVE_NODES': return store.commitMoveNodes()
      case 'COPY_NODES':        return store.copyNodes(action.ids)
      case 'PASTE_NODES':       return store.pasteNodes()
      case 'SET_AI_ISSUES':     return store.setAiIssues(action.issues)
      case 'UNDO':              return store.undo()
      case 'REDO':              return store.redo()
      default: break
    }
  }
  return { state, dispatch }
}

// ─── useEditorActions shim (identical API) ─────────────────────────
export function useEditorActions() {
  // Return bound action functions directly from the store
  const {
    setGraph, setRevision, updateGraphSilent, applyGraphPatch, setLayoutType, addNode, updateNode, moveNode, commitMove,
    deleteNode, addEdge, moveEdge, commitEdgeMove, updateEdge, deleteEdge,
    selectNode, selectEdge, deselect, setAiIssues, undo, redo,
    selectNodes, deleteNodes, moveNodes, commitMoveNodes, copyNodes, pasteNodes,
  } = useEditorStore()
  return {
    setGraph, setRevision, updateGraphSilent, applyGraphPatch, setLayoutType, addNode, updateNode, moveNode, commitMove,
    deleteNode, addEdge, moveEdge, commitEdgeMove, updateEdge, deleteEdge,
    selectNode, selectEdge, deselect, setAiIssues, undo, redo,
    selectNodes, deleteNodes, moveNodes, commitMoveNodes, copyNodes, pasteNodes,
  }
}
