import { get, post } from './apiClient'

function normalizeListResponse(data) {
  if (Array.isArray(data)) return { list: data }
  if (Array.isArray(data?.list)) return data
  if (Array.isArray(data?.items)) {
    return { ...data, list: data.items }
  }
  return { ...data, list: [] }
}

function normalizeVersion(version = {}) {
  return {
    ...version,
    id: version.id || version.versionId || '',
    label: version.label || version.name || '未命名版本',
    createdAt: version.createdAt || version.created_at || new Date().toISOString(),
  }
}

function normalizeMember(member = {}) {
  const id = member.id || member.userId || member.memberId || ''
  return {
    ...member,
    id,
    userId: member.userId || id,
    name: member.name || member.displayName || member.username || member.email || '',
  }
}

function buildVersionLabel(label) {
  if (label) return label
  return `version ${new Date().toLocaleString('zh-CN', { hour12: false })}`
}

export function listVersions(projectId) {
  return get(`/api/v1/projects/${projectId}/versions`)
    .then(normalizeListResponse)
    .then((data) => ({
      ...data,
      list: data.list.map((item) => normalizeVersion(item)),
    }))
}

export function createVersion(projectId, payload = {}) {
  return post(`/api/v1/projects/${projectId}/versions`, {
    ...payload,
    label: buildVersionLabel(payload?.label),
  }).then((data) => normalizeVersion(data?.version || data))
}

export function rollbackVersion(projectId, versionId, payload = {}) {
  return post(`/api/v1/projects/${projectId}/versions/${versionId}/rollback`, payload)
}

export function deleteVersion(projectId, versionId) {
  return post(`/api/v1/projects/${projectId}/versions/${versionId}/delete`, {})
}

export function listMembers(projectId) {
  return get(`/api/v1/projects/${projectId}/members`)
    .then(normalizeListResponse)
    .then((data) => ({
      ...data,
      list: data.list.map((item) => normalizeMember(item)),
    }))
}

export function inviteMember(projectId, payload) {
  return post(`/api/v1/projects/${projectId}/members/invite`, payload)
}

export function updateMemberRole(projectId, memberId, payload) {
  return post(`/api/v1/projects/${projectId}/members/${memberId}/update-role`, payload)
}

export function removeMember(projectId, memberId) {
  return post(`/api/v1/projects/${projectId}/members/${memberId}/remove`, {})
}
