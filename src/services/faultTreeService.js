import { get, post, download } from './apiClient'

export function importFaultTree({ projectId, nodes, edges, revision = 0 }) {
  return post('/api/v1/fault-trees/import', { projectId, nodes, edges, revision })
}

export function getFaultTreeGraph(projectId) {
  return get(`/api/v1/fault-trees/${projectId}/graph`).then((data) => {
    const graph = data?.graph || data || {}
    return {
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : [],
      revision: graph.revision ?? null,
    }
  })
}

export function saveFaultTreeGraph(projectId, payload) {
  return post(`/api/v1/fault-trees/${projectId}/graph/save`, payload)
}

export async function exportFaultTree(projectId) {
  return download(`/api/v1/fault-trees/${projectId}/export`)
}
