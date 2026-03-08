/**
 * faultTreeService.js — 故障树图数据管理
 */
import { get, post } from './apiClient'

/** GET /api/v1/fault-trees/{projectId}/graph */
export async function getFaultTreeGraph(projectId) {
  return get(`/api/v1/fault-trees/${projectId}/graph`)
}

/**
 * POST /api/v1/fault-trees/{projectId}/graph/save
 * @param {string} projectId
 * @param {{ nodes, edges, revision }} body
 */
export async function saveFaultTreeGraph(projectId, body) {
  return post(`/api/v1/fault-trees/${projectId}/graph/save`, body)
}

/**
 * POST /api/v1/fault-trees/{projectId}/validate
 * @param {string} projectId
 * @param {{ nodes, edges }} body
 */
export async function validateFaultTree(projectId, body) {
  return post(`/api/v1/fault-trees/${projectId}/validate`, body)
}

/**
 * GET /api/v1/fault-trees/{projectId}/export
 * 返回 Blob，调用方自行触发下载
 */
export async function exportFaultTree(projectId) {
  return get(`/api/v1/fault-trees/${projectId}/export`, undefined, { _blob: true })
}

/**
 * POST /api/v1/fault-trees/import
 * @param {{ projectId, nodes, edges }} body
 */
export async function importFaultTree(body) {
  return post('/api/v1/fault-trees/import', body)
}
