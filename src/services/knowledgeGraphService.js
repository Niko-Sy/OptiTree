/**
 * knowledgeGraphService.js — 知识图谱图数据管理
 *
 * 注意：后端 KG 节点格式与前端 React Flow 格式存在差异，
 * 需通过 kgAdapter.js 进行转换。
 */
import { get, post } from './apiClient'
import { rfNodeToBackend, backendToRFNode } from '../utils/kgAdapter'

/**
 * GET /api/v1/knowledge-graphs/{projectId}/graph
 * 返回转换为 React Flow 格式的节点和边
 */
export async function getKnowledgeGraph(projectId) {
  const data = await get(`/api/v1/knowledge-graphs/${projectId}/graph`)
  return {
    rfNodes: (data.rfNodes || []).map(backendToRFNode),
    rfEdges: data.rfEdges || [],
    revision: data.revision,
  }
}

/**
 * POST /api/v1/knowledge-graphs/{projectId}/graph/save
 * 自动将 RF 格式节点转为后端格式后发送
 * @param {string} projectId
 * @param {{ rfNodes, rfEdges, revision }} body
 */
export async function saveKnowledgeGraph(projectId, { rfNodes, rfEdges, revision }) {
  return post(`/api/v1/knowledge-graphs/${projectId}/graph/save`, {
    rfNodes: rfNodes.map(rfNodeToBackend),
    rfEdges,
    revision,
  })
}

/**
 * POST /api/v1/knowledge-graphs/{projectId}/validate
 * @param {string} projectId
 * @param {{ rfNodes, rfEdges }} body（前端 RF 格式）
 */
export async function validateKnowledgeGraph(projectId, { rfNodes, rfEdges }) {
  return post(`/api/v1/knowledge-graphs/${projectId}/validate`, {
    rfNodes: rfNodes.map(rfNodeToBackend),
    rfEdges,
  })
}

/**
 * GET /api/v1/knowledge-graphs/{projectId}/export
 * 返回 Blob
 */
export async function exportKnowledgeGraph(projectId) {
  return get(`/api/v1/knowledge-graphs/${projectId}/export`, undefined, { _blob: true })
}

/**
 * POST /api/v1/knowledge-graphs/import
 * @param {{ projectId, rfNodes, rfEdges }} body（前端 RF 格式）
 */
export async function importKnowledgeGraph({ projectId, rfNodes, rfEdges }) {
  return post('/api/v1/knowledge-graphs/import', {
    projectId,
    rfNodes: rfNodes.map(rfNodeToBackend),
    rfEdges,
  })
}
