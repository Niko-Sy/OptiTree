import { get, post } from './apiClient'

export function listNotifications(params = {}) {
  return get('/api/v1/notifications', params)
}

export function getUnreadCount() {
  return get('/api/v1/notifications/unread-count')
}

export function markNotificationRead(id) {
  return post(`/api/v1/notifications/${id}/read`, {})
}

export function markAllNotificationsRead() {
  return post('/api/v1/notifications/read-all', {})
}

export function notificationAction(id, action) {
  return post(`/api/v1/notifications/${id}/action`, { action })
}

export function listTeamActivities(limit = 20) {
  return get('/api/v1/team/activities', { limit })
}
