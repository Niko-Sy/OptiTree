/**
 * projectService.js — 仪表盘与项目管理
 */
import { get, post } from './apiClient'

/** GET /api/v1/dashboard/summary */
export async function getDashboardSummary() {
  return get('/api/v1/dashboard/summary')
}

/**
 * GET /api/v1/projects
 * @param {{ type?, keyword?, page?, pageSize?, sortBy?, sortOrder? }} params
 */
export async function listProjects(params = {}) {
  return get('/api/v1/projects', params)
}

/**
 * POST /api/v1/projects
 * @param {{ name, type, description?, tags? }} body
 */
export async function createProject(body) {
  return post('/api/v1/projects', body)
}

/** GET /api/v1/projects/{projectId} */
export async function getProject(projectId) {
  return get(`/api/v1/projects/${projectId}`)
}

/** POST /api/v1/projects/{projectId}/update */
export async function updateProject(projectId, body) {
  return post(`/api/v1/projects/${projectId}/update`, body)
}

/** POST /api/v1/projects/{projectId}/delete */
export async function deleteProject(projectId) {
  return post(`/api/v1/projects/${projectId}/delete`, {})
}
