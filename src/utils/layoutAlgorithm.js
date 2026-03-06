/**
 * computeLayout(nodes, edges, canvasWidth?)
 *
 * BFS-based hierarchical layout for fault trees.
 * Returns a new nodes array with x, y coordinates assigned.
 *
 * Strategy:
 *   - Phase 1: BFS from root (node with no incoming edges) → compute level for each node
 *   - Phase 2: Group nodes by level, distribute evenly horizontally
 */
export function computeLayout(nodes, edges, canvasWidth = 900) {
  if (!nodes || nodes.length === 0) return nodes

  const NODE_W = 120
  const NODE_H = 60
  const H_GAP = 160   // horizontal gap between node centers
  const V_GAP = 130   // vertical gap between levels

  // Build adjacency: parentId → [childId]
  const children = {}
  const inDegree = {}

  nodes.forEach(n => {
    children[n.id] = []
    inDegree[n.id] = 0
  })

  edges.forEach(e => {
    // convention: "from" is parent (top), "to" is child (bottom)
    if (children[e.from] !== undefined) {
      children[e.from].push(e.to)
    }
    if (inDegree[e.to] !== undefined) {
      inDegree[e.to]++
    }
  })

  // Find root(s) — nodes with no incoming edges
  const roots = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
  const rootId = roots.length > 0 ? roots[0] : nodes[0].id

  // Phase 1: BFS to compute levels
  const levels = {}
  const queue = [{ id: rootId, level: 0 }]
  const visited = new Set()

  while (queue.length > 0) {
    const { id, level } = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    levels[id] = level

    ;(children[id] || []).forEach(childId => {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 })
      }
    })
  }

  // Handle orphan nodes (not reachable from root)
  nodes.forEach(n => {
    if (levels[n.id] === undefined) {
      levels[n.id] = 0
    }
  })

  // Phase 2: Group by level, assign coordinates
  const byLevel = {}
  nodes.forEach(n => {
    const lv = levels[n.id]
    if (!byLevel[lv]) byLevel[lv] = []
    byLevel[lv].push(n.id)
  })

  const result = nodes.map(n => ({ ...n }))
  const idToNode = {}
  result.forEach(n => { idToNode[n.id] = n })

  Object.keys(byLevel).forEach(lv => {
    const ids = byLevel[lv]
    const count = ids.length
    const totalWidth = count * H_GAP
    const startX = Math.max(canvasWidth / 2 - totalWidth / 2 + H_GAP / 2, H_GAP / 2)

    ids.forEach((id, i) => {
      const node = idToNode[id]
      node.x = startX + i * H_GAP
      node.y = 60 + Number(lv) * V_GAP
      node.width = node.width || NODE_W
      node.height = node.height || NODE_H
    })
  })

  return result
}
