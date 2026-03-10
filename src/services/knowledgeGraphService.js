import { get, post, download } from './apiClient'
import { rfNodeToBackend, backendToRFNode } from '../utils/kgAdapter'

export function importKnowledgeGraph({ projectId, rfNodes, rfEdges, revision = 0 }) {
  const backendNodes = (rfNodes || []).map(rfNodeToBackend)
  return post('/api/v1/knowledge-graphs/import', { projectId, rfNodes: backendNodes, rfEdges, revision })
}

function normalizeRFNode(node, index) {
  const n = node?.position ? node : backendToRFNode(node || {})
  return {
    id: n.id || `kg_node_${index}`,
    type: n.type || 'entityNode',
    position: {
      x: Number.isFinite(n.position?.x) ? n.position.x : 0,
      y: Number.isFinite(n.position?.y) ? n.position.y : 0,
    },
    data: n.data || { label: '未命名', entityType: 'entityNode' },
    ...(n.style ? { style: n.style } : {}),
  }
}

export async function getKnowledgeGraph(projectId) {
  const data = await get(`/api/v1/knowledge-graphs/${projectId}/graph`)
  const graph = data?.graph || data || {}
  const rawNodes = graph.rfNodes || graph.nodes || []
  const rawEdges = graph.rfEdges || graph.edges || []
  return {
    rfNodes: rawNodes.map((node, i) => normalizeRFNode(node, i)),
    rfEdges: rawEdges,
    revision: graph.revision ?? null,
  }
}

export function saveKnowledgeGraph(projectId, payload) {
  const backendPayload = {
    ...payload,
    rfNodes: (payload?.rfNodes || []).map(rfNodeToBackend),
  }
  return post(`/api/v1/knowledge-graphs/${projectId}/graph/save`, backendPayload)
}

export async function exportKnowledgeGraph(projectId) {
  return download(`/api/v1/knowledge-graphs/${projectId}/export`)
}
