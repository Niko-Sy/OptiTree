/**
 * validateFaultTree(nodes, edges)
 *
 * Returns an array of issue objects: [{ nodeId, level, message }]
 * level: 'error' | 'warning' | 'info'
 *
 * Checks:
 *  1. Orphan nodes (not connected to any edge, except when only 1 node exists)
 *  2. Cycle detection via DFS + recursion stack
 *  3. Gate input count (gate nodes should have ≥ 2 children)
 *  4. Basic event should have no children
 *  5. Top event should be unique (only 1 node with no parents)
 */
export function validateFaultTree(nodes, edges) {
  if (!nodes || nodes.length === 0) return []

  const issues = []
  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = n })

  // Build adjacency lists
  const children = {}  // parentId → [childId]
  const parents = {}   // childId  → [parentId]
  nodes.forEach(n => {
    children[n.id] = []
    parents[n.id] = []
  })
  edges.forEach(e => {
    if (children[e.from]) children[e.from].push(e.to)
    if (parents[e.to])    parents[e.to].push(e.from)
  })

  // 1. Orphan detection
  if (nodes.length > 1) {
    const connected = new Set()
    edges.forEach(e => { connected.add(e.from); connected.add(e.to) })
    nodes.forEach(n => {
      if (!connected.has(n.id)) {
        issues.push({ nodeId: n.id, level: 'error', message: `节点 "${n.name}" 是孤立节点，未连接到任何边` })
      }
    })
  }

  // 2. Cycle detection (DFS)
  const color = {}  // white=0, gray=1 (in stack), black=2
  nodes.forEach(n => { color[n.id] = 0 })

  function dfs(id) {
    color[id] = 1
    for (const childId of (children[id] || [])) {
      if (color[childId] === 1) {
        issues.push({ nodeId: id, level: 'error', message: `检测到循环依赖：节点 "${nodeMap[id]?.name}" 存在环路` })
        return
      }
      if (color[childId] === 0) dfs(childId)
    }
    color[id] = 2
  }
  nodes.forEach(n => { if (color[n.id] === 0) dfs(n.id) })

  // 3. Gate input count
  nodes.forEach(n => {
    if (n.type === 'gate') {
      const childCount = (children[n.id] || []).length
      if (n.name === 'NOT') {
        // NOT gate should have exactly 1 input
        if (childCount !== 1) {
          issues.push({ nodeId: n.id, level: 'warning', message: `NOT 门 "${n.name}" 应有且仅有 1 个输入，当前 ${childCount} 个` })
        }
      } else {
        // AND / OR gates should have ≥ 2 inputs
        if (childCount < 2) {
          issues.push({ nodeId: n.id, level: 'warning', message: `逻辑门 "${n.name}" 只有 ${childCount} 个输入，建议至少连接 2 个子节点` })
        }
      }
    }
  })

  // 4. Basic event should have no children
  nodes.forEach(n => {
    if (n.type === 'basicEvent' && (children[n.id] || []).length > 0) {
      issues.push({ nodeId: n.id, level: 'warning', message: `基本事件 "${n.name}" 不应有子节点` })
    }
  })

  // 5. Top event uniqueness
  const topEvents = nodes.filter(n => parents[n.id]?.length === 0)
  if (topEvents.length > 1) {
    issues.push({ nodeId: null, level: 'warning', message: `存在 ${topEvents.length} 个根节点（无父节点的节点），故障树应只有一个顶事件` })
  }

  // 6. Tree depth warning
  const maxDepth = Math.max(0, ...nodes.map(n => {
    let depth = 0
    let cur = n.id
    const visited = new Set()
    while ((parents[cur] || []).length > 0 && !visited.has(cur)) {
      visited.add(cur)
      cur = parents[cur][0]
      depth++
    }
    return depth
  }))
  if (maxDepth > 6) {
    issues.push({ nodeId: null, level: 'info', message: `故障树深度为 ${maxDepth} 层，层级较深，建议拆分中间事件简化模型` })
  }

  return issues
}
