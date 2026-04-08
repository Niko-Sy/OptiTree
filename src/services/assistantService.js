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

export async function sendMessageStream(conversationId, message, model, { onChunk, onDone, signal } = {}) {
  let reply = ''
  let doneMeta = null

  await postStream(
    `/api/v1/assistant/conversations/${conversationId}/messages/stream`,
    { message, ...(model ? { model } : {}) },
    {
      signal,
      onEvent: (event) => {
        // content / partial 均追加文本
        if (event?.type === 'content' || event?.type === 'partial') {
          const chunk = event.content || ''
          reply += chunk
          onChunk?.(chunk, { reply })
          return
        }
        if (event?.type === 'error') {
          throw new ApiError(event.message || 'AI 服务暂不可用', {
            code:    event.code,
            details: event,
          })
        }
        if (event?.type === 'done') {
          doneMeta = event
          onDone?.(doneMeta)
        }
      },
    }
  )

  return { reply, meta: doneMeta }
}
