import { get, post, postStream, ApiError } from './apiClient'
import { createVersion } from './collaborationService'

const QUICK_QUESTIONS = {
  faultTree: [
    { id: 'ft-1', label: '关键薄弱点', question: '这个故障树的关键薄弱点在哪里？' },
    { id: 'ft-2', label: '降低故障率', question: '如何降低顶事件发生概率？' },
    { id: 'ft-3', label: '检查中间事件', question: '是否存在冗余或缺失的中间事件？' },
  ],
  knowledgeGraph: [
    { id: 'kg-1', label: '核心实体', question: '当前知识图谱的核心实体有哪些？' },
    { id: 'kg-2', label: '关系检查', question: '哪些关系可能存在冲突或缺失？' },
    { id: 'kg-3', label: '数据建议', question: '请给出后续补充数据建议。' },
  ],
}

export function getQuickQuestions(contextType = 'faultTree') {
  return QUICK_QUESTIONS[contextType] || QUICK_QUESTIONS.faultTree
}

export async function chatWithAI(context, contextType, message, { onChunk, signal } = {}) {
  let reply = ''
  let doneMeta = null

  await postStream('/api/v1/ai/chat/stream', {
    context: context || { nodes: [], edges: [] },
    contextType,
    message,
  }, {
    signal,
    onEvent: (event) => {
      if (event?.type === 'content') {
        const chunk = event.content || ''
        reply += chunk
        onChunk?.(chunk, { reply })
        return
      }

      if (event?.type === 'error') {
        throw new ApiError(event.message || 'AI 服务暂不可用', {
          code: event.code,
          details: event,
        })
      }

      if (event?.type === 'done') {
        doneMeta = event
      }
    },
  })

  return { reply, meta: doneMeta }
}

export async function getAiModels() {
  const data = await get('/api/v1/ai/models')
  if (Array.isArray(data)) return data
  return data?.list || data?.models || []
}

export async function uploadDocuments(files, options = {}) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  Object.entries(options).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      form.append(k, String(v))
    }
  })
  const data = await post('/api/v1/documents/upload', form)
  return {
    docIds: data?.docIds || data?.list?.map((item) => item.id) || [],
  }
}

function normalizeTaskResponse(data, fallbackProjectId) {
  const task = data?.task || data?.result || data
  return {
    ...data,
    taskId: task?.taskId || task?.id || data?.taskId || '',
    projectId: task?.projectId || data?.projectId || fallbackProjectId || '',
    status: task?.status || data?.status || 'pending',
    task,
  }
}

export function generateFaultTree(docIds, topEvent, config = {}, projectId) {
  return post('/api/v1/ai/fault-trees/generate', {
    docIds,
    topEvent,
    config,
    ...(projectId ? { projectId } : {}),
  }).then((data) => normalizeTaskResponse(data, projectId))
}

export function generateKnowledgeGraph(docIds, config = {}, projectId) {
  return post('/api/v1/ai/knowledge-graphs/generate', {
    docIds,
    config,
    ...(projectId ? { projectId } : {}),
  }).then((data) => normalizeTaskResponse(data, projectId))
}

export function getTaskStatus(taskId) {
  return get(`/api/v1/ai/tasks/${taskId}`).then((data) => ({
    ...data,
    task: data?.task || data,
  }))
}

export async function saveVersion(projectId, snapshot, description = '') {
  return createVersion(projectId, {
    label: description || undefined,
    snapshot,
  })
}

export async function validateGraph({ nodes = [], edges = [] }) {
  const issues = []
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    issues.push({ level: 'error', message: '图数据格式不正确' })
  }
  if (nodes.length === 0) {
    issues.push({ level: 'warning', message: '当前图为空，建议先添加节点' })
  }
  return { passed: issues.every((it) => it.level !== 'error'), issues }
}
