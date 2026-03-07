/**
 * aiService.js — AI 与后端接口预留层
 * 所有函数当前返回 mock 数据，后端接入时替换实现即可
 */

// ─── 后端基础配置（TODO: 替换为实际后端地址）─────────────────────
// const BASE_URL = 'https://your-backend.com/api'
// const AI_MODEL  = 'qwen-plus'  // 阿里百炼 / 其他开源大模型

/** 模拟网络延迟 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── 1. 文档上传与解析 ─────────────────────────────────────────────
/**
 * 上传文档并解析为知识片段
 * @param {File[]} files - 文件列表（pdf/doc/xlsx/txt）
 * @param {object} options - { quality: 'fast'|'balanced'|'precise', model: string }
 * @returns {Promise<{ docIds: string[], summary: string }>}
 *
 * TODO: 替换为实际后端上传接口
 * POST /api/documents/upload
 * FormData: files[], quality, model
 */
export async function uploadDocuments(files, options = {}) {
  await delay(800)
  console.log('[aiService] uploadDocuments', files, options)
  // TODO: const form = new FormData()
  // TODO: files.forEach(f => form.append('files', f))
  // TODO: const res = await fetch(`${BASE_URL}/documents/upload`, { method: 'POST', body: form })
  // TODO: return res.json()

  // Mock 返回
  return {
    docIds: files.map((_, i) => `doc_${Date.now()}_${i}`),
    summary: `已解析 ${files.length} 份文档，提取实体约 120 个，关系约 80 条`,
  }
}

// ─── 2. AI 生成故障树 ───────────────────────────────────────────────
/**
 * 基于已上传文档生成故障树
 * @param {string[]} docIds - 文档 ID 列表
 * @param {string} topEvent - 顶事件描述
 * @param {object} config - { quality, depth, maxNodes }
 * @returns {Promise<{ nodes: Node[], edges: Edge[], accuracy: number }>}
 *
 * TODO: 替换为实际 AI 生成接口
 * POST /api/fault-tree/generate
 * Body: { docIds, topEvent, config }
 */
export async function generateFaultTree(docIds, topEvent, config = {}) {
  await delay(2000)
  console.log('[aiService] generateFaultTree', { docIds, topEvent, config })
  // TODO: const res = await fetch(`${BASE_URL}/fault-tree/generate`, {
  // TODO:   method: 'POST',
  // TODO:   headers: { 'Content-Type': 'application/json' },
  // TODO:   body: JSON.stringify({ docIds, topEvent, config })
  // TODO: })
  // TODO: return res.json()

  // Mock 返回 —— 一个简单的故障树结构
  const id = `proj_${Date.now()}`
  return {
    projectId: id,
    nodes: [
      { id: 'root', type: 'topEvent', name: topEvent || '顶事件', x: 0, y: 0, width: 140, height: 60 },
      { id: 'gate1', type: 'gate', name: 'OR', gateType: 'OR', x: 0, y: 0, width: 80, height: 64 },
      { id: 'mid1', type: 'midEvent', name: 'AI生成中间事件1', x: 0, y: 0, width: 120, height: 56 },
      { id: 'mid2', type: 'midEvent', name: 'AI生成中间事件2', x: 0, y: 0, width: 120, height: 56 },
      { id: 'b1', type: 'basicEvent', name: 'AI生成底事件1', probability: 0.02, x: 0, y: 0, width: 110, height: 56 },
      { id: 'b2', type: 'basicEvent', name: 'AI生成底事件2', probability: 0.01, x: 0, y: 0, width: 110, height: 56 },
    ],
    edges: [
      { id: 'e1', from: 'root', to: 'gate1' },
      { id: 'e2', from: 'gate1', to: 'mid1' },
      { id: 'e3', from: 'gate1', to: 'mid2' },
      { id: 'e4', from: 'mid1', to: 'b1' },
      { id: 'e5', from: 'mid2', to: 'b2' },
    ],
    accuracy: 0.83,  // 结构准确率（目标 ≥ 80%）
  }
}

// ─── 3. AI 生成知识图谱 ─────────────────────────────────────────────
/**
 * 基于已上传文档生成知识图谱（React Flow 格式）
 * @param {string[]} docIds - 文档 ID 列表
 * @param {object} config - { quality, entityTypes: string[] }
 * @returns {Promise<{ kgId: string, nodes: RFNode[], edges: RFEdge[] }>}
 *
 * TODO: 替换为实际 AI 知识图谱生成接口
 * POST /api/knowledge-graph/generate
 * Body: { docIds, config }
 */
export async function generateKnowledgeGraph(docIds, config = {}) {
  await delay(2500)
  console.log('[aiService] generateKnowledgeGraph', { docIds, config })
  // TODO: const res = await fetch(`${BASE_URL}/knowledge-graph/generate`, {
  // TODO:   method: 'POST',
  // TODO:   headers: { 'Content-Type': 'application/json' },
  // TODO:   body: JSON.stringify({ docIds, config })
  // TODO: })
  // TODO: return res.json()

  // Mock 返回 —— React Flow 格式节点与边
  return {
    kgId: `kg_${Date.now()}`,
    nodes: [
      { id: 'e1', type: 'entityNode', position: { x: 300, y: 100 }, data: { label: '泵体', entityType: 'component', description: '核心泵体部件', sourceDoc: '' } },
      { id: 'e2', type: 'eventNode',  position: { x: 100, y: 250 }, data: { label: '过热故障', entityType: 'event', description: '温度异常升高', sourceDoc: '' } },
      { id: 'e3', type: 'entityNode', position: { x: 500, y: 250 }, data: { label: '冷却系统', entityType: 'component', description: '负责散热', sourceDoc: '' } },
      { id: 'e4', type: 'causeNode',  position: { x: 100, y: 400 }, data: { label: '冷却液泄漏', entityType: 'cause', description: '根本原因', sourceDoc: '' } },
    ],
    edges: [
      { id: 'ke1', source: 'e1', target: 'e2', label: '导致', type: 'smoothstep' },
      { id: 'ke2', source: 'e3', target: 'e1', label: '冷却', type: 'smoothstep' },
      { id: 'ke3', source: 'e4', target: 'e2', label: '引发', type: 'smoothstep' },
    ],
    entityCount: 4,
    relationCount: 3,
  }
}

// ─── 4. AI 逻辑校验（故障树 + 知识图谱通用）──────────────────────
/**
 * 校验图结构逻辑合理性，返回问题列表
 * @param {object[]} nodes
 * @param {object[]} edges
 * @param {'faultTree'|'knowledge'} graphType
 * @returns {Promise<{ issues: AiIssue[], suggestions: string[] }>}
 *
 * TODO: 替换为 AI 大模型逻辑推理接口
 * POST /api/validate
 * Body: { nodes, edges, graphType }
 *
 * 当前 fallback 到本地 aiValidator.js
 */
export async function validateGraph(nodes, edges, graphType = 'faultTree') {
  await delay(300)
  console.log('[aiService] validateGraph', { nodeCount: nodes.length, edgeCount: edges.length, graphType })
  // TODO: const res = await fetch(`${BASE_URL}/validate`, {
  // TODO:   method: 'POST',
  // TODO:   headers: { 'Content-Type': 'application/json' },
  // TODO:   body: JSON.stringify({ nodes, edges, graphType })
  // TODO: })
  // TODO: return res.json()

  // Fallback: 引入本地校验（故障树专用）
  if (graphType === 'faultTree') {
    const { validateFaultTree } = await import('../utils/aiValidator.js')
    const issues = validateFaultTree(nodes, edges)
    return { issues, suggestions: issues.length === 0 ? ['图结构逻辑正确，暂无优化建议'] : [] }
  }

  return { issues: [], suggestions: ['知识图谱 AI 校验功能即将上线'] }
}

// ─── 5. 版本管理（预留后端） ────────────────────────────────────────
/**
 * 获取项目版本历史
 * @param {string} projectId
 * @returns {Promise<Version[]>}
 *
 * TODO: GET /api/versions?projectId=xxx
 */
export async function listVersions(projectId) {
  console.log('[aiService] listVersions', projectId)
  // TODO: return fetch(`${BASE_URL}/versions?projectId=${projectId}`).then(r => r.json())

  // Fallback: 读 localStorage
  try {
    return JSON.parse(localStorage.getItem(`optitree_versions_${projectId}`) || '[]')
  } catch {
    return []
  }
}

/**
 * 保存项目快照为新版本
 * @param {string} projectId
 * @param {{ nodes, edges }} snapshot
 * @param {string} label - 版本说明
 * @returns {Promise<Version>}
 *
 * TODO: POST /api/versions
 */
export async function saveVersion(projectId, snapshot, label = '') {
  console.log('[aiService] saveVersion', projectId, label)
  // TODO: return fetch(`${BASE_URL}/versions`, { method: 'POST', ... })

  // Fallback: 写 localStorage
  const version = {
    id: `v_${Date.now()}`,
    projectId,
    label: label || `版本 ${new Date().toLocaleString('zh-CN')}`,
    createdAt: new Date().toISOString(),
    snapshot,
  }
  try {
    const key = `optitree_versions_${projectId}`
    const versions = JSON.parse(localStorage.getItem(key) || '[]')
    versions.unshift(version)
    // 最多保留 30 个版本
    localStorage.setItem(key, JSON.stringify(versions.slice(0, 30)))
  } catch {}
  return version
}
