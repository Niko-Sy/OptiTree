/**
 * collaborationService.js — 版本管理与协作成员管理
 */
import { get, post } from './apiClient'

// ─── 版本管理 ──────────────────────────────────────────────────────

/**
 * GET /api/v1/projects/{projectId}/versions
 * @param {string} projectId
 * @param {{ page?, pageSize? }} params
 */
export async function listVersions(projectId, params = {}) {
  return get(`/api/v1/projects/${projectId}/versions`, params)
}

/**
 * POST /api/v1/projects/{projectId}/versions
 * @param {string} projectId
 * @param {{ label?, snapshot }} body
 */
export async function createVersion(projectId, body) {
  return post(`/api/v1/projects/${projectId}/versions`, body)
}

/**
 * GET /api/v1/projects/{projectId}/versions/{versionId}
 */
export async function getVersion(projectId, versionId) {
  return get(`/api/v1/projects/${projectId}/versions/${versionId}`)
}

/**
 * POST /api/v1/projects/{projectId}/versions/{versionId}/rollback
 * @param {string} projectId
 * @param {string} versionId
 * @param {{ saveCurrent? }} options
 */
export async function rollbackVersion(projectId, versionId, options = {}) {
  return post(`/api/v1/projects/${projectId}/versions/${versionId}/rollback`, options)
}

/**
 * POST /api/v1/projects/{projectId}/versions/{versionId}/delete
 */
export async function deleteVersion(projectId, versionId) {
  return post(`/api/v1/projects/${projectId}/versions/${versionId}/delete`, {})
}

// ─── 协作成员管理 ──────────────────────────────────────────────────

/**
 * GET /api/v1/projects/{projectId}/members
 */
export async function listMembers(projectId) {
  return get(`/api/v1/projects/${projectId}/members`)
}

/**
 * POST /api/v1/projects/{projectId}/members/invite
 * @param {string} projectId
 * @param {{ email, role }} body
 */
export async function inviteMember(projectId, body) {
  return post(`/api/v1/projects/${projectId}/members/invite`, body)
}

/**
 * POST /api/v1/projects/{projectId}/members/{memberId}/update-role
 * @param {string} projectId
 * @param {string} memberId
 * @param {{ role }} body
 */
export async function updateMemberRole(projectId, memberId, body) {
  return post(`/api/v1/projects/${projectId}/members/${memberId}/update-role`, body)
}

/**
 * POST /api/v1/projects/{projectId}/members/{memberId}/remove
 */
export async function removeMember(projectId, memberId) {
  return post(`/api/v1/projects/${projectId}/members/${memberId}/remove`, {})
}
