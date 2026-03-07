/**
 * useKnowledgeStore.jsx — 知识图谱状态管理
 * Context + useReducer 模式，与 useEditorStore.jsx 保持一致的架构
 * 存储 React Flow 格式的节点（rfNodes）和边（rfEdges）
 */
import { createContext, useContext, useReducer, useCallback } from 'react'
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow'

// ─── 初始状态 ─────────────────────────────────────────────────────
const initialState = {
  rfNodes: [],          // React Flow Node[]
  rfEdges: [],          // React Flow Edge[]
  selectedIds: [],      // 选中节点 id 列表
  selectedEdgeId: null, // 选中边 id
  aiIssues: [],         // { nodeId?, level:'error'|'warning'|'info', message }[]
  history: [],          // JSON 快照数组
  historyIndex: -1,
}

// ─── 最大历史步数 ─────────────────────────────────────────────────
const MAX_HISTORY = 50

function makeSnapshot(state) {
  return JSON.stringify({ rfNodes: state.rfNodes, rfEdges: state.rfEdges })
}

function pushHistory(state) {
  const snap = makeSnapshot(state)
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(snap)
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  return { history: newHistory, historyIndex: newHistory.length - 1 }
}

// ─── Reducer ──────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case 'SET_GRAPH': {
      const { rfNodes, rfEdges } = action
      const next = { ...state, rfNodes, rfEdges }
      return { ...next, ...pushHistory(next) }
    }

    case 'NODES_CHANGE': {
      // React Flow onNodesChange 标准处理
      const rfNodes = applyNodeChanges(action.changes, state.rfNodes)
      return { ...state, rfNodes }
    }

    case 'EDGES_CHANGE': {
      const rfEdges = applyEdgeChanges(action.changes, state.rfEdges)
      return { ...state, rfEdges }
    }

    case 'CONNECT': {
      // React Flow onConnect 添加新边
      const rfEdges = addEdge(
        { ...action.connection, type: 'smoothstep', animated: false, label: '' },
        state.rfEdges
      )
      const next = { ...state, rfEdges }
      return { ...next, ...pushHistory(next) }
    }

    case 'ADD_NODE': {
      const rfNodes = [...state.rfNodes, action.node]
      const next = { ...state, rfNodes }
      return { ...next, ...pushHistory(next) }
    }

    case 'UPDATE_NODE': {
      const rfNodes = state.rfNodes.map(n => {
        if (n.id !== action.id) return n
        return {
          ...n,
          data:  action.data  ? { ...n.data,  ...action.data  } : n.data,
          style: action.style ? { ...n.style, ...action.style } : n.style,
        }
      })
      const next = { ...state, rfNodes }
      return { ...next, ...pushHistory(next) }
    }

    case 'DELETE_NODE': {
      const rfNodes = state.rfNodes.filter(n => n.id !== action.id)
      const rfEdges = state.rfEdges.filter(e => e.source !== action.id && e.target !== action.id)
      const next = { ...state, rfNodes, rfEdges }
      return { ...next, ...pushHistory(next) }
    }

    case 'UPDATE_EDGE': {
      const rfEdges = state.rfEdges.map(e =>
        e.id === action.id ? { ...e, ...action.patch } : e
      )
      const next = { ...state, rfEdges }
      return { ...next, ...pushHistory(next) }
    }

    case 'DELETE_EDGE': {
      const rfEdges = state.rfEdges.filter(e => e.id !== action.id)
      const next = { ...state, rfEdges }
      return { ...next, ...pushHistory(next) }
    }

    case 'COMMIT_NODE_MOVES': {
      // 拖拽结束后提交历史（避免拖拽过程中每帧都写入历史）
      return { ...state, ...pushHistory(state) }
    }

    case 'SELECT': {
      return { ...state, selectedIds: action.ids ?? [], selectedEdgeId: action.edgeId ?? null }
    }

    case 'SET_AI_ISSUES': {
      return { ...state, aiIssues: action.issues }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const historyIndex = state.historyIndex - 1
      const { rfNodes, rfEdges } = JSON.parse(state.history[historyIndex])
      return { ...state, rfNodes, rfEdges, historyIndex }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const historyIndex = state.historyIndex + 1
      const { rfNodes, rfEdges } = JSON.parse(state.history[historyIndex])
      return { ...state, rfNodes, rfEdges, historyIndex }
    }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────
const KnowledgeStoreContext = createContext(null)
const KnowledgeActionsContext = createContext(null)

export function KnowledgeStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // --- Actions ---
  const actions = {
    setGraph: useCallback((rfNodes, rfEdges) =>
      dispatch({ type: 'SET_GRAPH', rfNodes, rfEdges }), []),

    onNodesChange: useCallback((changes) =>
      dispatch({ type: 'NODES_CHANGE', changes }), []),

    onEdgesChange: useCallback((changes) =>
      dispatch({ type: 'EDGES_CHANGE', changes }), []),

    onConnect: useCallback((connection) =>
      dispatch({ type: 'CONNECT', connection }), []),

    onNodeDragStop: useCallback(() =>
      dispatch({ type: 'COMMIT_NODE_MOVES' }), []),

    addNode: useCallback((node) =>
      dispatch({ type: 'ADD_NODE', node }), []),

    updateNode: useCallback((id, data, style) =>
      dispatch({ type: 'UPDATE_NODE', id, data, style }), []),

    deleteNode: useCallback((id) =>
      dispatch({ type: 'DELETE_NODE', id }), []),

    updateEdge: useCallback((id, patch) =>
      dispatch({ type: 'UPDATE_EDGE', id, patch }), []),

    deleteEdge: useCallback((id) =>
      dispatch({ type: 'DELETE_EDGE', id }), []),

    select: useCallback((ids = [], edgeId = null) =>
      dispatch({ type: 'SELECT', ids, edgeId }), []),

    setAiIssues: useCallback((issues) =>
      dispatch({ type: 'SET_AI_ISSUES', issues }), []),

    undo: useCallback(() => dispatch({ type: 'UNDO' }), []),
    redo: useCallback(() => dispatch({ type: 'REDO' }), []),
  }

  return (
    <KnowledgeStoreContext.Provider value={state}>
      <KnowledgeActionsContext.Provider value={actions}>
        {children}
      </KnowledgeActionsContext.Provider>
    </KnowledgeStoreContext.Provider>
  )
}

export function useKnowledgeStore() {
  return useContext(KnowledgeStoreContext)
}

export function useKnowledgeActions() {
  return useContext(KnowledgeActionsContext)
}
