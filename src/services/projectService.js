import { get, post } from './apiClient'

function normalizeListResponse(data) {
  if (Array.isArray(data)) return { list: data }
  if (Array.isArray(data?.list)) return data
  if (Array.isArray(data?.items)) {
    return { ...data, list: data.items }
  }
  return { ...data, list: [] }
}

function normalizeProjectResponse(data) {
  const project = data?.project || data
  return { ...data, project }
}

function normalizeSummaryResponse(data) {
  return data?.summary || data || {}
}

export function getDashboardSummary() {
  return get('/api/v1/dashboard/summary').then(normalizeSummaryResponse)
}

export function listProjects(params = {}) {
  return get('/api/v1/projects', params).then(normalizeListResponse)
}

export function createProject(payload) {
  return post('/api/v1/projects', payload).then(normalizeProjectResponse)
}

export function getProject(projectId) {
  return get(`/api/v1/projects/${projectId}`).then(normalizeProjectResponse)
}

export function deleteProject(projectId) {
  return post(`/api/v1/projects/${projectId}/delete`, {})
}
