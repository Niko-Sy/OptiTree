import { get, post, del, postStream, ApiError } from './apiClient'

// ─── 模型列表 ────────────────────────────────────────────────────────────────

export async function getAssistantModels() {
  const data = await get('/api/v1/assistant/models')
  return data?.list ?? []
}

// ─── 会话管理 ────────────────────────────────────────────────────────────────

export async function createConversation(projectId, type) {
  const data = await post('/api/v1/assistant/conversations', { projectId, type })
  return data?.conversation
}

export async function getConversations({ projectId, type, page, pageSize } = {}) {
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  if (type)      params.set('type', type)
  if (page)      params.set('page', String(page))
  if (pageSize)  params.set('pageSize', String(pageSize))
  const qs = params.toString()
  const data = await get(`/api/v1/assistant/conversations${qs ? `?${qs}` : ''}`)
  return data ?? { list: [], total: 0, hasMore: false }
}

export async function deleteConversation(conversationId) {
  return del(`/api/v1/assistant/conversations/${conversationId}`)
}

// ─── 消息 ────────────────────────────────────────────────────────────────────

export async function getConversationMessages(conversationId, { before, limit } = {}) {
  const params = new URLSearchParams()
  if (before) params.set('before', before)
  if (limit)  params.set('limit', String(limit))
  const qs = params.toString()
  const data = await get(
    `/api/v1/assistant/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`
  )
  return {
    conversation: data?.conversation ?? null,
    messages:     data?.messages    ?? [],
    nextCursor:   data?.nextCursor  ?? null,
    hasMore:      data?.hasMore     ?? false,
  }
}

export async function sendMessage(conversationId, message, model) {
  const data = await post(
    `/api/v1/assistant/conversations/${conversationId}/messages`,
    { message, ...(model ? { model } : {}) }
  )

  return {
    conversationId:  data?.conversationId ?? conversationId,
    userMessage:     data?.userMessage ?? null,
    assistantMessage:data?.assistantMessage ?? null,
    reply:           data?.reply ?? data?.assistantMessage?.content ?? '',
    suggestions:     Array.isArray(data?.suggestions) ? data.suggestions : [],
  }
}

export async function sendMessageStream(
  conversationId,
  message,
  model,
  { onStarted, onChunk, onHeartbeat, onPartial, onDone, onError, signal } = {}
) {
  let reply = ''
  let doneMeta = null
  let startedMeta = null
  let partialMeta = null
  let hasAnyChunk = false
  let lastHeartbeatAt = null

  await postStream(
    `/api/v1/assistant/conversations/${conversationId}/messages/stream`,
    { message, ...(model ? { model } : {}) },
    {
      signal,
      onEvent: (event) => {
        if (!event || typeof event !== 'object') return

        if (event.type === 'started') {
          startedMeta = event
          onStarted?.(event)
          return
        }

        if (event.type === 'heartbeat') {
          lastHeartbeatAt = Date.now()
          onHeartbeat?.(event)
          return
        }

        if (event.type === 'content') {
          const chunk = typeof event.content === 'string' ? event.content : ''
          if (!chunk) return
          hasAnyChunk = true
          reply += chunk
          onChunk?.(chunk, { reply, event })
          return
        }

        if (event.type === 'partial') {
          partialMeta = event
          // 兼容后端偶发在 partial 里回传文本
          const chunk = typeof event.content === 'string' ? event.content : ''
          if (chunk) {
            hasAnyChunk = true
            reply += chunk
            onChunk?.(chunk, { reply, event })
          }
          onPartial?.(event, { reply })
          return
        }

        if (event.type === 'error') {
          const error = new ApiError(event.message || 'AI 服务暂不可用', {
            code:    event.code,
            details: event,
          })
          onError?.(error, event)
          throw error
        }

        if (event.type === 'done') {
          doneMeta = event
          onDone?.(doneMeta, { reply, partial: partialMeta, hasAnyChunk })
        }
      },
    }
  )

  return {
    reply,
    meta: doneMeta,
    started: startedMeta,
    partial: partialMeta,
    hasAnyChunk,
    lastHeartbeatAt,
  }
}
