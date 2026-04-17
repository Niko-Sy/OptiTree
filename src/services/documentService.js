import { download, get } from './apiClient'

export const DOCUMENT_READER_MAX_ATTEMPTS = 3
const DOCUMENT_READER_RETRY_DELAY_MS = 900
const PREVIEW_TIMEOUT_MS = 3000
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

const PDF_EXTENSIONS = new Set(['pdf'])
const TABULAR_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'tsv'])
const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'log', 'text',
  'json', 'xml', 'yaml', 'yml', 'ini', 'conf', 'properties', 'sql',
])

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toReaderError(error, fallbackMessage, attempts) {
  const next = new Error(error?.message || fallbackMessage)
  next.status = error?.status
  next.code = error?.code
  next.details = error?.details
  next.attempts = attempts
  return next
}

function shouldRetryRequest(error) {
  if (error?.name === 'AbortError') return true
  const status = Number(error?.status)
  if (!Number.isFinite(status)) return true
  return RETRYABLE_STATUSES.has(status)
}

async function executeReaderRequest(requestFn, {
  maxAttempts = DOCUMENT_READER_MAX_ATTEMPTS,
  delayMs = DOCUMENT_READER_RETRY_DELAY_MS,
  onAttempt,
  shouldRetry = shouldRetryRequest,
  errorMessage = '请求失败',
} = {}) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onAttempt?.(attempt, maxAttempts)
    try {
      return await requestFn({ attempt, maxAttempts })
    } catch (error) {
      lastError = error
      const canRetry = attempt < maxAttempts && shouldRetry(error)
      if (!canRetry) break
      await wait(delayMs)
    }
  }

  throw toReaderError(lastError, errorMessage, maxAttempts)
}

function normalizeExt(value = '') {
  return String(value || '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase()
}

function getExtFromName(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export function inferReaderKind(doc = {}) {
  const explicit = String(doc.readerKind || doc.reader_kind || '').trim().toLowerCase()
  if (explicit === 'pdf' || explicit === 'tabular' || explicit === 'text') return explicit

  const ext = normalizeExt(doc.ext || getExtFromName(doc.name || doc.fileName || ''))
  if (PDF_EXTENSIONS.has(ext) || ext === 'docx') return 'pdf'
  if (TABULAR_EXTENSIONS.has(ext)) return 'tabular'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'

  const mimeType = String(doc.mimeType || doc.mime_type || '').toLowerCase()
  if (mimeType.startsWith('text/')) return 'text'
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'tabular'

  return 'unsupported'
}

function normalizePreviewStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'processing' || status === 'failed' || status === 'ready') return status
  return 'ready'
}

export function normalizeDocumentMeta(doc = {}) {
  const ext = normalizeExt(doc.ext || getExtFromName(doc.name || doc.fileName || ''))
  return {
    ...doc,
    id: String(doc.id || doc.docId || doc.documentId || ''),
    name: doc.name || doc.fileName || doc.filename || `文档-${doc.id || ''}`,
    ext,
    mimeType: doc.mimeType || doc.mime_type || '',
    readerKind: inferReaderKind(doc),
    previewStatus: normalizePreviewStatus(doc.previewStatus || doc.preview_status),
    derivedPdfDocId: doc.derivedPdfDocId || doc.derived_pdf_doc_id || '',
    size: Number(doc.size || doc.fileSize || 0) || 0,
    uploadedAt: doc.uploadedAt || doc.createdAt || doc.created_at || '',
  }
}

function normalizeDocumentList(data) {
  const list = data?.list || data?.documents || data?.items || data || []
  return Array.isArray(list) ? list.map(normalizeDocumentMeta) : []
}

function normalizeLocator(result = {}) {
  const locator = result.locator || {}
  const type = locator.type || result.readerKind || inferReaderKind(result.document || result)
  return {
    ...locator,
    type,
  }
}

export function normalizeSearchResult(result = {}) {
  const document = normalizeDocumentMeta({
    ...(result.document || {}),
    id: result.docId || result.documentId || result.document?.id,
    name: result.docName || result.documentName || result.document?.name,
    ext: result.ext || result.document?.ext,
    mimeType: result.mimeType || result.document?.mimeType,
    readerKind: result.readerKind || result.document?.readerKind,
    previewStatus: result.previewStatus || result.document?.previewStatus,
    derivedPdfDocId: result.derivedPdfDocId || result.document?.derivedPdfDocId,
  })

  return {
    ...result,
    id: result.id || `${document.id}-${result.page || result.rowIndex || result.blockIndex || 0}-${result.startOffset || 0}`,
    document,
    docId: document.id,
    docName: document.name,
    readerKind: document.readerKind,
    snippet: result.snippet || result.excerpt || result.matchText || '',
    keyword: result.keyword || result.q || locatorKeyword(normalizeLocator(result)),
    locator: normalizeLocator(result),
  }
}

export function locatorKeyword(locator = {}) {
  return String(locator.keyword || '').trim()
}

export async function listProjectDocuments(projectId, options = {}) {
  if (!projectId) return []
  try {
    const data = await executeReaderRequest(
      () => get(`/api/v1/projects/${projectId}/documents`),
      { ...options, errorMessage: '项目文档列表加载失败' },
    )
    return normalizeDocumentList(data)
  } catch (error) {
    if (error?.status === 404) return []
    throw error
  }
}

export async function searchProjectDocuments(projectId, query, options = {}) {
  if (!projectId || !String(query || '').trim()) return []
  try {
    const data = await executeReaderRequest(
      () => get(`/api/v1/projects/${projectId}/documents/search`, { q: query }),
      { ...options, errorMessage: '项目文档搜索失败' },
    )
    const list = data?.list || data?.documents || data?.items || data || []
    return Array.isArray(list) ? list.map(normalizeSearchResult) : []
  } catch (error) {
    if (error?.status === 404) return []
    throw error
  }
}

export function resolvePreviewDocumentId(doc = {}) {
  const meta = normalizeDocumentMeta(doc)
  if (meta.ext === 'docx' && meta.derivedPdfDocId) return String(meta.derivedPdfDocId)
  return meta.id
}

async function requestDocumentBlobWithTimeout(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS)
  try {
    return await download(path, undefined, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchDocumentBlobWithRetry({
  primaryPath,
  fallbackPath,
  onAttempt,
  maxAttempts = DOCUMENT_READER_MAX_ATTEMPTS,
  delayMs = DOCUMENT_READER_RETRY_DELAY_MS,
  errorMessage,
}) {
  let requestPath = primaryPath
  let switchedToFallback = false
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onAttempt?.(attempt, maxAttempts)
    try {
      return await requestDocumentBlobWithTimeout(requestPath)
    } catch (error) {
      lastError = error

      const canFallback = !switchedToFallback
        && fallbackPath
        && (error?.status === 404 || error?.status === 405)

      if (canFallback) {
        requestPath = fallbackPath
        switchedToFallback = true
        continue
      }

      const canRetry = attempt < maxAttempts && shouldRetryRequest(error)
      if (!canRetry) break
      await wait(delayMs)
    }
  }

  throw toReaderError(lastError, errorMessage, maxAttempts)
}

export async function fetchDocumentPreviewBlob(doc = {}, options = {}) {
  const previewDocId = resolvePreviewDocumentId(doc)
  if (!previewDocId) throw new Error('缺少文档 ID，无法预览')

  return fetchDocumentBlobWithRetry({
    primaryPath: `/api/v1/documents/${previewDocId}/preview`,
    fallbackPath: `/api/v1/documents/${previewDocId}/download`,
    onAttempt: options.onAttempt,
    maxAttempts: options.maxAttempts || DOCUMENT_READER_MAX_ATTEMPTS,
    errorMessage: '文档解析失败，请稍后重试',
  })
}

export async function fetchDocumentDownloadBlob(doc = {}, options = {}) {
  const meta = normalizeDocumentMeta(doc)
  if (!meta.id) throw new Error('缺少文档 ID，无法下载')

  return fetchDocumentBlobWithRetry({
    primaryPath: `/api/v1/documents/${meta.id}/download`,
    fallbackPath: `/api/v1/documents/${meta.id}/preview`,
    onAttempt: options.onAttempt,
    maxAttempts: options.maxAttempts || DOCUMENT_READER_MAX_ATTEMPTS,
    errorMessage: '文档下载失败，请稍后重试',
  })
}

export function matchDocumentName(doc = {}, expectedName = '') {
  const actual = String(doc.name || '').trim().toLowerCase()
  const expected = String(expectedName || '').trim().toLowerCase()
  if (!actual || !expected) return false
  if (actual === expected) return true
  if (actual.endsWith(expected) || expected.endsWith(actual)) return true
  return actual.replace(/\s+/g, '') === expected.replace(/\s+/g, '')
}

export function findProjectDocumentByName(documents = [], expectedName = '') {
  return documents.find((item) => matchDocumentName(item, expectedName)) || null
}

export function createSourceLocator(document, { page, excerpt } = {}) {
  const doc = normalizeDocumentMeta(document)
  const keyword = String(excerpt || '').trim()
  if (doc.readerKind === 'tabular') {
    return { type: 'tabular', keyword }
  }
  if (doc.readerKind === 'text') {
    return { type: 'text', keyword }
  }
  return {
    type: 'pdf',
    keyword,
    page: Number.isFinite(Number(page)) ? Number(page) : undefined,
  }
}

export function getDocumentFormatLabel(doc = {}) {
  const meta = normalizeDocumentMeta(doc)
  if (meta.ext) return meta.ext.toUpperCase()
  if (meta.readerKind === 'pdf') return 'PDF'
  if (meta.readerKind === 'tabular') return 'TABLE'
  if (meta.readerKind === 'text') return 'TEXT'
  return 'FILE'
}
