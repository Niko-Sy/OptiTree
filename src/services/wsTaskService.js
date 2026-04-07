import { tokenStore } from './apiClient'
import { getTaskStatus, getLatestFaultTreeTask } from './aiService'

const WS_BASE = (import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_API_BASE_URL || '')
  .replace(/\/$/, '')
  .replace(/\/api\/v1$/, '')

function toWsBase(urlBase) {
  if (!urlBase) {
    const { protocol, host } = window.location
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProtocol}//${host}`
  }
  if (urlBase.startsWith('http://')) return `ws://${urlBase.slice('http://'.length)}`
  if (urlBase.startsWith('https://')) return `wss://${urlBase.slice('https://'.length)}`
  return urlBase
}

const NORMAL_CLOSE = 1000
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'dead', 'cancelled'])

function toTaskEvent(task, fallbackProjectId, fallbackTaskId) {
  const status = task?.status || 'pending'
  let event = 'task.progress'

  if (status === 'pending') event = 'task.pending'
  if (status === 'retrying') event = 'task.retrying'
  if (status === 'completed') event = 'task.completed'
  if (status === 'failed') event = 'task.failed'
  if (status === 'dead') event = 'task.dead'
  if (status === 'cancelled') event = 'task.cancelled'

  return {
    event,
    ...task,
    taskId: task?.id || fallbackTaskId,
    projectId: task?.projectId || fallbackProjectId,
    projectStatus: task?.projectStatus || status,
  }
}

export class TaskWsManager {
  constructor({ projectId, taskId, taskType, token, onEvent, onStateChange, onError }) {
    this.projectId = projectId
    this.taskId = taskId
    this.taskType = taskType
    this.token = token || tokenStore.getAccess()
    this.onEvent = onEvent
    this.onStateChange = onStateChange
    this.onError = onError

    this.ws = null
    this.retryCount = 0
    this.maxDelay = 30000
    this.shouldReconnect = true
    this.reconnectTimer = null
    this.pollTimer = null
    this.pollInFlight = false
    this.pollInterval = 4000
    this.lastTaskStatus = ''
    this.snapshotTimer = null
    this.snapshotTimeout = 2000
    this.gotSnapshot = false
  }

  connect() {
    if (!this.projectId && !this.taskId) return
    this.disconnect(false, false)
    this.shouldReconnect = true

    if (!this.projectId || typeof WebSocket === 'undefined') {
      this.startPolling('ws-unavailable')
      return
    }

    const base = toWsBase(WS_BASE)
    // 每次建连时从 tokenStore 取最新 token，确保 REST 层自动刷新后 WS 重连仍能通过认证
    const freshToken = tokenStore.getAccess() || this.token
    const wsUrl = new URL(`${base}/api/v1/ws/tasks/${this.projectId}`)
    if (freshToken) wsUrl.searchParams.set('token', freshToken)

    this.ws = new WebSocket(wsUrl.toString())

    this.ws.onopen = () => {
      this.retryCount = 0
      this.stopPolling()
      this.gotSnapshot = false
      this.armSnapshotFallback('on-open')
      this.onStateChange?.('connected')
    }

    this.ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data)
        if (payload?.event === 'task.snapshot') {
          this.gotSnapshot = true
          this.clearSnapshotFallback()
        }
        if (payload?.event === 'task.pending' || payload?.event === 'task.progress' || payload?.event === 'task.retrying' || payload?.event === 'task.completed' || payload?.event === 'task.failed' || payload?.event === 'task.dead' || payload?.event === 'task.cancelled') {
          this.clearSnapshotFallback()
        }
        this.lastTaskStatus = payload?.status || payload?.projectStatus || this.lastTaskStatus
        if (TERMINAL_TASK_STATUSES.has(this.lastTaskStatus)) {
          this.stopPolling()
          this.shouldReconnect = false
          this.clearSnapshotFallback()
        }
        this.onEvent?.(payload)
      } catch {
        // Some servers may send plain ping/pong text frames.
      }
    }

    this.ws.onerror = (err) => {
      this.startPolling('ws-error')
      this.onError?.(err)
    }

    this.ws.onclose = async (evt) => {
      this.ws = null
      this.clearSnapshotFallback()
      this.onStateChange?.('closed')

      if (!this.shouldReconnect || evt.code === NORMAL_CLOSE) return

      await this.recoverTaskStatus()
      this.startPolling('ws-closed')
      this.scheduleReconnect()
    }
  }

  async recoverTaskStatus() {
    try {
      let task = null

      if (this.taskId) {
        const data = await getTaskStatus(this.taskId)
        task = data?.task || null
      } else if (this.projectId && this.taskType === 'ft') {
        const latest = await getLatestFaultTreeTask(this.projectId)
        task = latest?.task || latest || null
      }

      if (task) {
        const nextEvent = toTaskEvent(task, this.projectId, this.taskId)
        this.taskId = nextEvent.taskId || this.taskId
        this.lastTaskStatus = task.status || this.lastTaskStatus
        this.onEvent?.(nextEvent)
        if (TERMINAL_TASK_STATUSES.has(this.lastTaskStatus)) {
          this.stopPolling()
          this.shouldReconnect = false
          this.clearSnapshotFallback()
        }
      }
    } catch {
      // keep reconnecting, this is only a best-effort compensation.
    }
  }

  scheduleReconnect() {
    this.retryCount += 1
    const baseDelay = Math.min(1000 * (2 ** (this.retryCount - 1)), this.maxDelay)
    const jitter = 0.8 + Math.random() * 0.4
    const delay = Math.round(baseDelay * jitter)
    clearTimeout(this.reconnectTimer)
    this.onStateChange?.('reconnecting', { retryCount: this.retryCount, delay })
    this.reconnectTimer = setTimeout(() => {
      if (!this.shouldReconnect) return
      this.connect()
    }, delay)
  }

  updateTask(taskId) {
    this.taskId = taskId
    if (this.pollTimer) {
      this.recoverTaskStatus()
    }
  }

  updateTaskType(taskType) {
    this.taskType = taskType
  }

  startPolling(reason = 'polling') {
    const canPollByLatest = this.projectId && this.taskType === 'ft'
    if ((!this.taskId && !canPollByLatest) || this.pollTimer) return

    const poll = async () => {
      if (this.pollInFlight) return
      if (!this.taskId && !(this.projectId && this.taskType === 'ft')) return
      this.pollInFlight = true
      try {
        await this.recoverTaskStatus()
      } finally {
        this.pollInFlight = false
      }
    }

    this.onStateChange?.('polling', { reason })
    poll()
    this.pollTimer = setInterval(poll, this.pollInterval)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  armSnapshotFallback(reason = 'snapshot-timeout') {
    this.clearSnapshotFallback()
    this.snapshotTimer = setTimeout(async () => {
      if (!this.shouldReconnect || this.gotSnapshot) return
      this.onStateChange?.('recovering', { reason })
      await this.recoverTaskStatus()
    }, this.snapshotTimeout)
  }

  clearSnapshotFallback() {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
  }

  disconnect(closeSocket = true, disableReconnect = true) {
    clearTimeout(this.reconnectTimer)
    this.stopPolling()
    this.clearSnapshotFallback()
    this.shouldReconnect = !disableReconnect
    if (closeSocket && this.ws) {
      this.ws.close(NORMAL_CLOSE)
    }
    this.ws = null
  }
}

export function createTaskWsManager(options) {
  return new TaskWsManager(options)
}
