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

// ─── Agent 流式会话 ─────────────────────────────────────────────────────────

function hasGraphSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  const hasFaultTreeShape = Array.isArray(snapshot.nodes) && Array.isArray(snapshot.edges)
  const hasKnowledgeShape = Array.isArray(snapshot.rfNodes) && Array.isArray(snapshot.rfEdges)
  return hasFaultTreeShape || hasKnowledgeShape
}

function normalizeMaxToolRounds(value) {
  if (!Number.isFinite(value)) return null
  const parsed = Math.trunc(value)
  return parsed > 0 ? parsed : null
}

export async function sendAgentStream(
  conversationId,
  message,
  model,
  {
    graphSnapshot,
    clientRevision,
    readOnly,
    maxToolRounds,
    onStarted,
    onChunk,
    onHeartbeat,
    onThinking,
    onClientTool,
    onToolCallStart,
    onToolCallResult,
    onToolCallError,
    onToolCallCancelled,
    onConfirmRequired,
    onPreviewReady,
    onPreviewDiscarded,
    onIterationLimitReached,
    onIterationResumed,
    onIterationStopped,
    onDone,
    onError,
    onUnknownEvent,
    signal,
  } = {}
) {
  let reply = ''
  let doneMeta = null
  let startedMeta = null
  let hasAnyChunk = false
  let lastHeartbeatAt = null

  const hasSnapshot = hasGraphSnapshot(graphSnapshot)
  const readonlyMode = readOnly === true
  const normalizedRounds = normalizeMaxToolRounds(maxToolRounds)
  const normalizedRevision = Number.isFinite(clientRevision) ? Math.trunc(clientRevision) : null

  if (hasSnapshot && !readonlyMode && !Number.isFinite(normalizedRevision)) {
    throw new ApiError('Agent 写模式下携带图快照时必须提供 clientRevision', {
      code: 40001,
      details: {
        hasSnapshot,
        readOnly: readOnly === true,
        clientRevision,
      },
    })
  }

  const payload = {
    message,
    ...(model ? { model } : {}),
    ...(hasSnapshot ? { graphSnapshot } : {}),
    ...(Number.isFinite(normalizedRevision) ? { clientRevision: normalizedRevision } : {}),
    ...(typeof readOnly === 'boolean' ? { readOnly: readonlyMode } : {}),
    ...(Number.isFinite(normalizedRounds) ? { maxToolRounds: normalizedRounds } : {}),
  }

  await postStream(
    `/api/v1/assistant/conversations/${conversationId}/agent/stream`,
    payload,
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

        if (event.type === 'thinking') {
          onThinking?.(event)
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

        if (event.type === 'client_tool') {
          onClientTool?.(event)
          return
        }

        if (event.type === 'tool_call_start') {
          onToolCallStart?.(event)
          return
        }

        if (event.type === 'tool_call_result') {
          onToolCallResult?.(event)
          return
        }

        if (event.type === 'tool_call_error') {
          onToolCallError?.(event)
          return
        }

        if (event.type === 'tool_call_cancelled') {
          onToolCallCancelled?.(event)
          return
        }

        if (event.type === 'confirm_required') {
          onConfirmRequired?.(event)
          return
        }

        if (event.type === 'preview_ready') {
          onPreviewReady?.(event)
          return
        }

        if (event.type === 'preview_discarded') {
          onPreviewDiscarded?.(event)
          return
        }

        if (event.type === 'iteration_limit_reached') {
          onIterationLimitReached?.(event)
          return
        }

        if (event.type === 'iteration_resumed') {
          onIterationResumed?.(event)
          return
        }

        if (event.type === 'iteration_stopped') {
          onIterationStopped?.(event)
          return
        }

        if (event.type === 'error') {
          const error = new ApiError(event.message || 'Agent 服务暂不可用', {
            code: event.code,
            details: event,
          })
          onError?.(error, event)
          throw error
        }

        if (event.type === 'done') {
          doneMeta = event
          onDone?.(doneMeta, { reply, hasAnyChunk })
          return
        }

        onUnknownEvent?.(event)
      },
    }
  )

  return {
    reply,
    meta: doneMeta,
    started: startedMeta,
    hasAnyChunk,
    lastHeartbeatAt,
  }
}

// ─── Agent 会话控制 ───────────────────────────────────────────────────────

export async function confirmAgentAction(
  sessionId,
  { callId, approved, approvedOps, continueRounds } = {}
) {
  const data = await post(`/api/v1/agent/sessions/${sessionId}/confirm`, {
    callId,
    approved: !!approved,
    ...(Array.isArray(approvedOps) ? { approvedOps } : {}),
    ...(Number.isFinite(continueRounds) ? { continueRounds } : {}),
  })
  return data
}

export async function cancelAgentSession(sessionId) {
  const data = await post(`/api/v1/agent/sessions/${sessionId}/cancel`, {})
  return data
}

function normalizeAgentSession(data) {
  const source = data?.source || ''
  const session = data?.session || null
  if (!session) return { session: null, source }

  if (!session.sessionId && session.id) {
    return {
      source,
      session: {
        ...session,
        sessionId: session.id,
      },
    }
  }

  return { source, session }
}

export async function getAgentSessionStatus(sessionId) {
  const data = await get(`/api/v1/agent/sessions/${sessionId}/status`)
  return normalizeAgentSession(data)
}
