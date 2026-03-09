import { createContext, useContext, useReducer, useCallback } from 'react'

// ─── Initial State ────────────────────────────────────────────────
const initialState = {
  nodes: [],
  edges: [],
  layoutType: 'vertical',
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNodeIds: [],     // multi-select
  clipboard: null,         // { nodes[], edges[] }
  history: [],
  historyIndex: -1,
  aiIssues: [],
}

// ─── Helpers ──────────────────────────────────────────────────────
function snapshot(state) {
  return JSON.stringify({ nodes: state.nodes, edges: state.edges })
}
function pushHistory(state) {
  const snap = snapshot(state)
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(snap)
  return { ...state, history: newHistory, historyIndex: newHistory.length - 1 }
}

// ─── Reducer ──────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case 'SET_GRAPH': {
      const next = { ...state, nodes: action.nodes, edges: action.edges, selectedNodeId: null, aiIssues: [] }
      return pushHistory(next)
    }

    case 'SET_LAYOUT_TYPE':
      return { ...state, layoutType: action.layoutType }

    case 'ADD_NODE': {
      const next = { ...state, nodes: [...state.nodes, action.node] }
      return pushHistory(next)
    }

    case 'UPDATE_NODE': {
      const next = {
        ...state,
        nodes: state.nodes.map(n => n.id === action.id ? { ...n, ...action.patch } : n),
      }
      return pushHistory(next)
    }

    case 'MOVE_NODE': {
      // Silent move — does NOT push history (history is pushed on mouseUp)
      return {
        ...state,
        nodes: state.nodes.map(n => n.id === action.id ? { ...n, x: action.x, y: action.y } : n),
      }
    }

    case 'COMMIT_MOVE': {
      return pushHistory(state)
    }

    case 'DELETE_NODE': {
      const next = {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.id),
        edges: state.edges.filter(e => e.from !== action.id && e.to !== action.id),
        selectedNodeId: state.selectedNodeId === action.id ? null : state.selectedNodeId,
      }
      return pushHistory(next)
    }

    case 'ADD_EDGE': {
      // Prevent duplicate edges between same pair
      const exists = state.edges.some(e => e.from === action.edge.from && e.to === action.edge.to)
      if (exists) return state
      const next = { ...state, edges: [...state.edges, action.edge] }
      return pushHistory(next)
    }

    case 'UPDATE_EDGE': {
      const next = {
        ...state,
        edges: state.edges.map(e => e.id === action.id ? { ...e, ...action.patch } : e),
      }
      return pushHistory(next)
    }

    case 'DELETE_EDGE': {
      const next = {
        ...state,
        edges: state.edges.filter(e => e.id !== action.id),
        selectedEdgeId: state.selectedEdgeId === action.id ? null : state.selectedEdgeId,
      }
      return pushHistory(next)
    }

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.id, selectedEdgeId: null, selectedNodeIds: [] }

    case 'SELECT_EDGE':
      return { ...state, selectedEdgeId: action.id, selectedNodeId: null, selectedNodeIds: [] }

    case 'DESELECT':
      return { ...state, selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] }

    case 'SELECT_NODES':
      return { ...state, selectedNodeIds: action.ids, selectedNodeId: null, selectedEdgeId: null }

    case 'DELETE_NODES': {
      const ids = new Set(action.ids)
      const next = {
        ...state,
        nodes: state.nodes.filter(n => !ids.has(n.id)),
        edges: state.edges.filter(e => !ids.has(e.from) && !ids.has(e.to)),
        selectedNodeIds: [],
        selectedNodeId: null,
      }
      return pushHistory(next)
    }

    case 'MOVE_NODES': {
      // Silent batch move — history pushed on COMMIT_MOVE_NODES
      const ids = new Set(action.ids)
      return {
        ...state,
        nodes: state.nodes.map(n => ids.has(n.id)
          ? { ...n, x: n.x + action.dx, y: n.y + action.dy }
          : n),
      }
    }

    case 'COMMIT_MOVE_NODES':
      return pushHistory(state)

    case 'COPY_NODES': {
      const ids = new Set(action.ids)
      const nodes = state.nodes.filter(n => ids.has(n.id))
      const edges = state.edges.filter(e => ids.has(e.from) && ids.has(e.to))
      return { ...state, clipboard: { nodes, edges } }
    }

    case 'PASTE_NODES': {
      if (!state.clipboard) return state
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
        ...state,
        nodes: [...state.nodes, ...newNodes],
        edges: [...state.edges, ...newEdges],
        selectedNodeIds: newNodes.map(n => n.id),
        selectedNodeId: null,
      }
      return pushHistory(next)
    }

    case 'SET_AI_ISSUES':
      return { ...state, aiIssues: action.issues }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const idx = state.historyIndex - 1
      const { nodes, edges } = JSON.parse(state.history[idx])
      return { ...state, nodes, edges, historyIndex: idx, selectedNodeId: null, selectedEdgeId: null, aiIssues: [] }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const idx = state.historyIndex + 1
      const { nodes, edges } = JSON.parse(state.history[idx])
      return { ...state, nodes, edges, historyIndex: idx, selectedNodeId: null, selectedEdgeId: null, aiIssues: [] }
    }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────
const EditorContext = createContext(null)

export function EditorStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditorStore() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditorStore must be used within EditorStoreProvider')
  return ctx
}

// ─── Action Creators ──────────────────────────────────────────────
export function useEditorActions() {
  const { dispatch } = useEditorStore()

  const setGraph = useCallback((nodes, edges) =>
    dispatch({ type: 'SET_GRAPH', nodes, edges }), [dispatch])

  const setLayoutType = useCallback((layoutType) =>
    dispatch({ type: 'SET_LAYOUT_TYPE', layoutType }), [dispatch])

  const addNode = useCallback((node) =>
    dispatch({ type: 'ADD_NODE', node }), [dispatch])

  const updateNode = useCallback((id, patch) =>
    dispatch({ type: 'UPDATE_NODE', id, patch }), [dispatch])

  const moveNode = useCallback((id, x, y) =>
    dispatch({ type: 'MOVE_NODE', id, x, y }), [dispatch])

  const commitMove = useCallback(() =>
    dispatch({ type: 'COMMIT_MOVE' }), [dispatch])

  const deleteNode = useCallback((id) =>
    dispatch({ type: 'DELETE_NODE', id }), [dispatch])

  const addEdge = useCallback((edge) =>
    dispatch({ type: 'ADD_EDGE', edge }), [dispatch])

  const updateEdge = useCallback((id, patch) =>
    dispatch({ type: 'UPDATE_EDGE', id, patch }), [dispatch])

  const deleteEdge = useCallback((id) =>
    dispatch({ type: 'DELETE_EDGE', id }), [dispatch])

  const selectNode = useCallback((id) =>
    dispatch({ type: 'SELECT_NODE', id }), [dispatch])

  const selectEdge = useCallback((id) =>
    dispatch({ type: 'SELECT_EDGE', id }), [dispatch])

  const deselect = useCallback(() =>
    dispatch({ type: 'DESELECT' }), [dispatch])

  const setAiIssues = useCallback((issues) =>
    dispatch({ type: 'SET_AI_ISSUES', issues }), [dispatch])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [dispatch])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [dispatch])

  const selectNodes = useCallback((ids) =>
    dispatch({ type: 'SELECT_NODES', ids }), [dispatch])

  const deleteNodes = useCallback((ids) =>
    dispatch({ type: 'DELETE_NODES', ids }), [dispatch])

  const moveNodes = useCallback((ids, dx, dy) =>
    dispatch({ type: 'MOVE_NODES', ids, dx, dy }), [dispatch])

  const commitMoveNodes = useCallback(() =>
    dispatch({ type: 'COMMIT_MOVE_NODES' }), [dispatch])

  const copyNodes = useCallback((ids) =>
    dispatch({ type: 'COPY_NODES', ids }), [dispatch])

  const pasteNodes = useCallback(() =>
    dispatch({ type: 'PASTE_NODES' }), [dispatch])

  return { setGraph, setLayoutType, addNode, updateNode, moveNode, commitMove, deleteNode, addEdge, updateEdge, deleteEdge, selectNode, selectEdge, deselect, setAiIssues, undo, redo, selectNodes, deleteNodes, moveNodes, commitMoveNodes, copyNodes, pasteNodes }
}
