import dagre from 'dagre'

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

function buildGraph(nodes, edges) {
  const children = {}
  const inDegree = {}
  nodes.forEach(n => {
    children[n.id] = []
    inDegree[n.id] = 0
  })
  edges.forEach(e => {
    if (children[e.from] !== undefined) children[e.from].push(e.to)
    if (inDegree[e.to] !== undefined) inDegree[e.to]++
  })
  return { children, inDegree }
}

function bfsOrderAndLevels(nodes, edges) {
  const { children, inDegree } = buildGraph(nodes, edges)
  const roots = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
  const queue = roots.length > 0
    ? roots.map(id => ({ id, level: 0 }))
    : [{ id: nodes[0]?.id, level: 0 }]
  const visited = new Set()
  const levels = {}
  const order = []

  while (queue.length > 0) {
    const { id, level } = queue.shift()
    if (!id || visited.has(id)) continue
    visited.add(id)
    levels[id] = level
    order.push(id)
    ;(children[id] || []).forEach(childId => {
      if (!visited.has(childId)) queue.push({ id: childId, level: level + 1 })
    })
  }

  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      levels[n.id] = 0
      order.push(n.id)
    }
  })

  return { order, levels }
}

export function computeHorizontalLayout(nodes, edges, canvasHeight = 800) {
  if (!nodes || nodes.length === 0) return nodes

  const NODE_W = 120
  const NODE_H = 60
  const X_PAD = 100
  const H_STEP = 220
  const V_STEP = 130

  const { levels } = bfsOrderAndLevels(nodes, edges)
  const byLevel = {}
  nodes.forEach(n => {
    const lv = levels[n.id] ?? 0
    if (!byLevel[lv]) byLevel[lv] = []
    byLevel[lv].push(n.id)
  })

  const result = nodes.map(n => ({ ...n }))
  const idToNode = {}
  result.forEach(n => { idToNode[n.id] = n })

  Object.keys(byLevel).forEach(lv => {
    const ids = byLevel[lv]
    const count = ids.length
    const totalHeight = count * V_STEP
    const startY = Math.max(canvasHeight / 2 - totalHeight / 2 + V_STEP / 2, 60)

    ids.forEach((id, i) => {
      const node = idToNode[id]
      node.x = X_PAD + Number(lv) * H_STEP
      node.y = startY + i * V_STEP
      node.width = node.width || NODE_W
      node.height = node.height || NODE_H
    })
  })

  return result
}

export function computeGridLayout(nodes, edges) {
  if (!nodes || nodes.length === 0) return nodes

  const NODE_W = 120
  const NODE_H = 60
  const GAP = 170
  const PAD_X = 90
  const PAD_Y = 70

  const { order } = bfsOrderAndLevels(nodes, edges)
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const result = nodes.map(n => ({ ...n }))
  const idToNode = {}
  result.forEach(n => { idToNode[n.id] = n })

  order.forEach((id, index) => {
    const node = idToNode[id]
    if (!node) return
    const col = index % columns
    const row = Math.floor(index / columns)
    node.x = PAD_X + col * GAP
    node.y = PAD_Y + row * GAP
    node.width = node.width || NODE_W
    node.height = node.height || NODE_H
  })

  return result
}

export function computeForceLayout(nodes, edges, iterations = 120) {
  if (!nodes || nodes.length === 0) return nodes

  const NODE_W = 120
  const NODE_H = 60
  const areaW = 1200
  const areaH = 900
  const n = nodes.length
  const k = Math.sqrt((areaW * areaH) / Math.max(1, n))
  let temperature = Math.max(areaW, areaH) / 10

  const sim = nodes.map((node, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, n)
    const fallbackX = areaW / 2 + Math.cos(angle) * 160
    const fallbackY = areaH / 2 + Math.sin(angle) * 160
    return {
      ...node,
      x: Number.isFinite(node.x) ? node.x : fallbackX,
      y: Number.isFinite(node.y) ? node.y : fallbackY,
      dx: 0,
      dy: 0,
      width: node.width || NODE_W,
      height: node.height || NODE_H,
    }
  })

  const idToIndex = {}
  sim.forEach((node, idx) => { idToIndex[node.id] = idx })

  for (let iter = 0; iter < iterations; iter++) {
    sim.forEach(node => { node.dx = 0; node.dy = 0 })

    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i]
        const b = sim[j]
        const vx = a.x - b.x
        const vy = a.y - b.y
        const dist = Math.max(0.01, Math.hypot(vx, vy))
        const force = (k * k) / dist
        const fx = (vx / dist) * force
        const fy = (vy / dist) * force
        a.dx += fx
        a.dy += fy
        b.dx -= fx
        b.dy -= fy
      }
    }

    edges.forEach(edge => {
      const si = idToIndex[edge.from]
      const ti = idToIndex[edge.to]
      if (si === undefined || ti === undefined) return
      const s = sim[si]
      const t = sim[ti]
      const vx = s.x - t.x
      const vy = s.y - t.y
      const dist = Math.max(0.01, Math.hypot(vx, vy))
      const force = (dist * dist) / Math.max(1, k)
      const fx = (vx / dist) * force
      const fy = (vy / dist) * force
      s.dx -= fx
      s.dy -= fy
      t.dx += fx
      t.dy += fy
    })

    sim.forEach(node => {
      const disp = Math.max(0.01, Math.hypot(node.dx, node.dy))
      const limit = Math.min(disp, temperature)
      node.x += (node.dx / disp) * limit
      node.y += (node.dy / disp) * limit
      node.x = Math.max(40, Math.min(areaW - 40, node.x))
      node.y = Math.max(40, Math.min(areaH - 40, node.y))
    })

    temperature *= 0.96
  }

  const xs = sim.map(n0 => n0.x)
  const ys = sim.map(n0 => n0.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const targetX = 450
  const targetY = 300
  const shiftX = targetX - cx
  const shiftY = targetY - cy

  return sim.map(node => ({
    ...node,
    x: node.x + shiftX,
    y: node.y + shiftY,
  }))
}

export function selectAnchorsByLayout(fromNode, toNode, layoutType = 'vertical') {
  const fx = fromNode?.x ?? 0
  const tx = toNode?.x ?? 0
  const fcy = (fromNode?.y ?? 0) + (fromNode?.height ?? 60) / 2
  const tcy = (toNode?.y ?? 0) + (toNode?.height ?? 60) / 2
  const dx = tx - fx
  const dy = tcy - fcy

  const horizontalPair = dx >= 0
    ? { fromAnchor: 'right', toAnchor: 'left' }
    : { fromAnchor: 'left', toAnchor: 'right' }
  const verticalPair = dy >= 0
    ? { fromAnchor: 'bottom', toAnchor: 'top' }
    : { fromAnchor: 'top', toAnchor: 'bottom' }

  if (layoutType === 'horizontal') return horizontalPair
  if (layoutType === 'vertical') return verticalPair
  return Math.abs(dx) >= Math.abs(dy) ? horizontalPair : verticalPair
}

// ─── 知识图谱专用：Dagre 层次化布局（React Flow 格式）────────────────
// rfNodes: React Flow Node[]  (position: { x, y })
// rfEdges: React Flow Edge[]  (source, target)

const _KG_NODE_W = 160
const _KG_NODE_H = 52

/**
 * applyDagreLayout — 使用 dagre 对知识图谱节点排版
 * @param {object[]} rfNodes  - React Flow 节点数组
 * @param {object[]} rfEdges  - React Flow 边数组
 * @param {object}   options  - { direction:'TB'|'LR', rankSep, nodeSep }
 * @returns {object[]} 带有新 position 的 rfNodes 副本
 */
export function applyDagreLayout(rfNodes, rfEdges, options = {}) {
  if (!rfNodes.length) return rfNodes

  const {
    direction = 'TB',
    rankSep   = 120,
    nodeSep   = 80,
    nodeWidth  = _KG_NODE_W,
    nodeHeight = _KG_NODE_H,
  } = options

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep })

  rfNodes.forEach(node => {
    const w = Number(node.style?.width  || node.width  || nodeWidth)
    const h = Number(node.style?.height || node.height || nodeHeight)
    g.setNode(node.id, { width: w, height: h })
  })

  rfEdges.forEach(edge => {
    // dagre only needs source/target; skip self-loops to avoid layout artifacts
    if (edge.source !== edge.target) g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  return rfNodes.map(node => {
    const pos = g.node(node.id)
    if (!pos) return node
    const w = Number(node.style?.width  || node.width  || nodeWidth)
    const h = Number(node.style?.height || node.height || nodeHeight)
    // dagre returns CENTER coordinates; RF uses TOP-LEFT
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    }
  })
}

/**
 * assignOptimalHandles — 根据排版后的节点位置，为每条边分配最短路径方向的端点
 * 端点 ID 需要与 KgCanvas.jsx 中 KgNode 的 Handle id 保持一致。
 * @param {object[]} rfNodes - 已排版的 React Flow 节点数组
 * @param {object[]} rfEdges - React Flow 边数组
 * @returns {object[]} 带有 sourceHandle / targetHandle 的边副本
 */
export function assignOptimalHandles(rfNodes, rfEdges) {
  const nodeMap = {}
  rfNodes.forEach(n => { nodeMap[n.id] = n })

  return rfEdges.map(edge => {
    const src = nodeMap[edge.source]
    const tgt = nodeMap[edge.target]
    if (!src || !tgt) return edge

    const srcW = Number(src.style?.width  || _KG_NODE_W)
    const srcH = Number(src.style?.height || _KG_NODE_H)
    const tgtW = Number(tgt.style?.width  || _KG_NODE_W)
    const tgtH = Number(tgt.style?.height || _KG_NODE_H)

    const srcCx = (src.position?.x ?? 0) + srcW / 2
    const srcCy = (src.position?.y ?? 0) + srcH / 2
    const tgtCx = (tgt.position?.x ?? 0) + tgtW / 2
    const tgtCy = (tgt.position?.y ?? 0) + tgtH / 2

    const dx = tgtCx - srcCx
    const dy = tgtCy - srcCy

    let sourceHandle, targetHandle
    if (Math.abs(dy) >= Math.abs(dx)) {
      // 主要是纵向偏移
      if (dy >= 0) { sourceHandle = 'bottom-s'; targetHandle = 'top-t' }
      else          { sourceHandle = 'top-s';    targetHandle = 'bottom-t' }
    } else {
      // 主要是横向偏移
      if (dx >= 0) { sourceHandle = 'right-s'; targetHandle = 'left-t' }
      else          { sourceHandle = 'left-s';  targetHandle = 'right-t' }
    }

    return { ...edge, sourceHandle, targetHandle }
  })
}

// ════════════════════════════════════════════════════════════════════
//  3B — 碰撞检测：推开重叠节点
// ════════════════════════════════════════════════════════════════════
/**
 * resolveOverlaps — 对布局输出的节点进行多轮 bbox 碰撞检测，沿重叠最小轴推开节点
 * @param {object[]} rfNodes   - React Flow 节点数组 (position: { x, y })
 * @param {number}   iterations - 最大迭代次数（默认 3）
 */
export function resolveOverlaps(rfNodes, iterations = 3) {
  if (rfNodes.length < 2) return rfNodes
  const PAD = 20

  const sim = rfNodes.map(n => ({
    id: n.id,
    x: n.position?.x ?? 0,
    y: n.position?.y ?? 0,
    w: Number(n.style?.width  || _KG_NODE_W),
    h: Number(n.style?.height || _KG_NODE_H),
  }))

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i]; const b = sim[j]
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + PAD
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + PAD
        if (ox > 0 && oy > 0) {
          if (ox <= oy) {
            const half = ox / 2
            const dir = (a.x + a.w / 2) <= (b.x + b.w / 2) ? 1 : -1
            a.x -= dir * half; b.x += dir * half
          } else {
            const half = oy / 2
            const dir = (a.y + a.h / 2) <= (b.y + b.h / 2) ? 1 : -1
            a.y -= dir * half; b.y += dir * half
          }
          moved = true
        }
      }
    }
    if (!moved) break
  }

  const posMap = {}
  sim.forEach(s => { posMap[s.id] = { x: s.x, y: s.y } })
  return rfNodes.map(n => ({ ...n, position: posMap[n.id] ?? n.position }))
}

// ════════════════════════════════════════════════════════════════════
//  3A — 环形布局
// ════════════════════════════════════════════════════════════════════
/**
 * applyCircularLayout — 将节点按 BFS 顺序排列成圆形
 * 连通性强的节点相邻排列，使图中短边尽量不跨圆弧
 */
export function applyCircularLayout(rfNodes, rfEdges) {
  if (!rfNodes.length) return rfNodes
  const count = rfNodes.length

  const adj = {}; const degree = {}
  rfNodes.forEach(n => { adj[n.id] = []; degree[n.id] = 0 })
  rfEdges.forEach(e => {
    adj[e.source]?.push(e.target)
    adj[e.target]?.push(e.source)
    if (degree[e.source] !== undefined) degree[e.source]++
    if (degree[e.target] !== undefined) degree[e.target]++
  })

  // BFS 排序：从度数最高的节点出发
  const startId = rfNodes.reduce((best, n) =>
    degree[n.id] > degree[best.id] ? n : best, rfNodes[0]
  ).id

  const order = []; const visited = new Set(); const queue = [startId]
  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id); order.push(id)
    const nbs = [...(adj[id] ?? [])].sort((a, b) => (degree[b] ?? 0) - (degree[a] ?? 0))
    nbs.forEach(nb => { if (!visited.has(nb)) queue.push(nb) })
  }
  rfNodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id) })

  const indexMap = {}
  order.forEach((id, i) => { indexMap[id] = i })

  // 半径：按节点宽度 + 间距估算最小不重叠圆
  const radius = Math.max(180, (count * (_KG_NODE_W + 40)) / (2 * Math.PI))

  return rfNodes.map(n => {
    const i = indexMap[n.id] ?? 0
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    const nw = Number(n.style?.width  || _KG_NODE_W)
    const nh = Number(n.style?.height || _KG_NODE_H)
    return {
      ...n,
      position: {
        x: radius + radius * Math.cos(angle) - nw / 2,
        y: radius + radius * Math.sin(angle) - nh / 2,
      },
    }
  })
}

// ════════════════════════════════════════════════════════════════════
//  3A — 紧凑网格布局（BFS 顺序）
// ════════════════════════════════════════════════════════════════════
/**
 * applyKgCompactGridLayout — 按 BFS 连通顺序排列，相邻节点在网格中更近
 */
export function applyKgCompactGridLayout(rfNodes, rfEdges) {
  if (!rfNodes.length) return rfNodes

  const adj = {}; const degree = {}
  rfNodes.forEach(n => { adj[n.id] = []; degree[n.id] = 0 })
  rfEdges.forEach(e => {
    adj[e.source]?.push(e.target)
    adj[e.target]?.push(e.source)
    if (degree[e.source] !== undefined) degree[e.source]++
    if (degree[e.target] !== undefined) degree[e.target]++
  })

  const startId = rfNodes.reduce((best, n) =>
    degree[n.id] > degree[best.id] ? n : best, rfNodes[0]
  ).id

  const order = []; const visited = new Set(); const queue = [startId]
  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id); order.push(id)
    ;(adj[id] ?? []).forEach(nb => { if (!visited.has(nb)) queue.push(nb) })
  }
  rfNodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id) })

  const cols    = Math.max(2, Math.ceil(Math.sqrt(rfNodes.length)))
  const GAP_X   = _KG_NODE_W + 60
  const GAP_Y   = _KG_NODE_H + 60
  const orderMap = {}
  order.forEach((id, i) => { orderMap[id] = i })

  return rfNodes.map(n => {
    const i = orderMap[n.id] ?? 0
    return {
      ...n,
      position: {
        x: 60 + (i % cols) * GAP_X,
        y: 60 + Math.floor(i / cols) * GAP_Y,
      },
    }
  })
}

// ════════════════════════════════════════════════════════════════════
//  3C — 并行多边曲率偏移
// ════════════════════════════════════════════════════════════════════
/**
 * assignParallelEdgeOffsets — 检测同节点对间的多条边，
 * 将其转换为 bezier 类型并施加对称曲率，防止重叠遮挡
 */
export function assignParallelEdgeOffsets(rfEdges) {
  // 以无向方式分组（A→B 与 B→A 视为同一对）
  const pairGroups = {}
  rfEdges.forEach(edge => {
    const key = [edge.source, edge.target].sort().join('§')
    if (!pairGroups[key]) pairGroups[key] = []
    pairGroups[key].push(edge.id)
  })

  // 预设曲率对照表（对称分布）
  const curvatureSets = {
    2: [0.3, -0.3],
    3: [0, 0.45, -0.45],
    4: [0.3, -0.3, 0.6, -0.6],
  }

  return rfEdges.map(edge => {
    const key    = [edge.source, edge.target].sort().join('§')
    const group  = pairGroups[key]
    if (group.length <= 1) return edge  // 单边，不变

    const idx       = group.indexOf(edge.id)
    const curvatures = curvatureSets[group.length] ??
      group.map((_, i) => (i % 2 === 0 ? 1 : -1) * 0.3 * (Math.floor(i / 2) + 1))
    const curvature = curvatures[idx] ?? 0.3

    return { ...edge, type: 'bezier', pathOptions: { curvature } }
  })
}

// ════════════════════════════════════════════════════════════════════
//  3E — 按节点类型聚类排版
// ════════════════════════════════════════════════════════════════════
/**
 * applyClusteredLayout — 同类型节点用 dagre 组内排版，各类型组按圆形排列
 * 组间连线自动使用 assignOptimalHandles 计算最优端点
 */
export function applyClusteredLayout(rfNodes, rfEdges, options = {}) {
  if (!rfNodes.length) return rfNodes
  const { direction = 'TB' } = options

  // 按节点类型分组
  const groups = {}
  rfNodes.forEach(n => {
    const t = n.type || 'entityNode'
    if (!groups[t]) groups[t] = []
    groups[t].push(n)
  })

  const groupTypes = Object.keys(groups)
  if (groupTypes.length <= 1) return applyDagreLayout(rfNodes, rfEdges, options)

  const maxGroupSize  = Math.max(...groupTypes.map(t => groups[t].length))
  const groupRadius   = Math.max(380, maxGroupSize * 90)
  const layoutedAll   = []

  groupTypes.forEach((type, gi) => {
    const groupNodes = groups[type]
    const nodeIds    = new Set(groupNodes.map(n => n.id))
    const groupEdges = rfEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

    // 组内 dagre 排版
    let positioned = applyDagreLayout(groupNodes, groupEdges, {
      direction, rankSep: 80, nodeSep: 50,
    })

    // 计算组 bbox 中心
    const xs  = positioned.map(n => n.position.x)
    const ys  = positioned.map(n => n.position.y)
    const gcx = (Math.min(...xs) + Math.max(...xs)) / 2
    const gcy = (Math.min(...ys) + Math.max(...ys)) / 2

    // 将组中心移到圆形布置的目标位置
    const angle    = (2 * Math.PI * gi) / groupTypes.length - Math.PI / 2
    const targetCx = groupRadius + groupRadius * Math.cos(angle)
    const targetCy = groupRadius + groupRadius * Math.sin(angle)

    positioned = positioned.map(n => ({
      ...n,
      position: {
        x: n.position.x + (targetCx - gcx),
        y: n.position.y + (targetCy - gcy),
      },
    }))
    layoutedAll.push(...positioned)
  })

  // 消除组间可能的重叠（多迭代）
  return resolveOverlaps(layoutedAll, 5)
}
