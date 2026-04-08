import { get, post } from './apiClient'

function normalizeGenerationStatus(project = {}) {
  const raw = project.generation_status || project.generationStatus || project.projectStatus
  const status = raw || 'completed'
  return {
    ...project,
    generation_status: status,
  }
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) return { list: data }
  if (Array.isArray(data?.list)) return data
  if (Array.isArray(data?.items)) {
    return { ...data, list: data.items }
  }
  return { ...data, list: [] }
}

function normalizeProjectResponse(data) {
  const project = normalizeGenerationStatus(data?.project || data)
  return { ...data, project }
}

function normalizeSummaryResponse(data) {
  return data?.summary || data || {}
}

export function getDashboardSummary() {
  return get('/api/v1/dashboard/summary').then(normalizeSummaryResponse)
}

export function listProjects(params = {}) {
  return get('/api/v1/projects', params)
    .then(normalizeListResponse)
    .then((data) => ({
      ...data,
      list: (data?.list || []).map((project) => normalizeGenerationStatus(project)),
    }))
}

export function createProject(payload) {
  return post('/api/v1/projects', payload).then(normalizeProjectResponse)
}

export function getProject(projectId) {
  return get(`/api/v1/projects/${projectId}`).then(normalizeProjectResponse)
}

export function updateProject(projectId, payload) {
  return post(`/api/v1/projects/${projectId}/update`, payload).then(normalizeProjectResponse)
}

export function deleteProject(projectId) {
  return post(`/api/v1/projects/${projectId}/delete`, {})
}
