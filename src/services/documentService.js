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

const SEARCH_SNIPPET_ALLOWED_SYMBOLS = /[\s.,;:!?，。！？；：“”‘’、【】（）《》【】·…—_\-+/\\|@#$%^&*~`'=]+/

function collectSnippetMetrics(value = '') {
  const source = String(value || '')
  let readableCount = 0
  let tokenCount = 0
  let weirdCount = 0
  let latin1Count = 0
  let cjkCount = 0

  for (const char of source) {
    const code = char.charCodeAt(0)
    if (/[0-9a-zA-Z]/.test(char)) {
      readableCount += 1
      tokenCount += 1
      continue
    }
    if (/[\u4e00-\u9fa5]/.test(char)) {
      readableCount += 1
      tokenCount += 1
      cjkCount += 1
      continue
    }
    if (SEARCH_SNIPPET_ALLOWED_SYMBOLS.test(char)) {
      readableCount += 1
      continue
    }

    if (code >= 161 && code <= 255) {
      latin1Count += 1
    }
    weirdCount += 1
  }

  const total = source.length || 1
  return {
    readableRatio: readableCount / total,
    tokenRatio: tokenCount / total,
    weirdRatio: weirdCount / total,
    latin1Ratio: latin1Count / total,
    cjkRatio: cjkCount / total,
  }
}

function containsKeyword(source = '', keyword = '') {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase()
  if (normalizedKeyword.length < 2) return true
  return String(source || '').toLowerCase().includes(normalizedKeyword)
}

function tryDecodeLatin1AsUtf8(input = '') {
  const source = String(input || '')
  if (!source) return ''

  try {
    const bytes = Uint8Array.from(Array.from(source), (char) => char.charCodeAt(0) & 0xff)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function chooseBestSnippetCandidate(cleanedSnippet = '', keyword = '') {
  if (!cleanedSnippet) return cleanedSnippet

  const decodedCandidate = normalizeSearchSnippetText(tryDecodeLatin1AsUtf8(cleanedSnippet))
  if (!decodedCandidate || decodedCandidate === cleanedSnippet) {
    return cleanedSnippet
  }

  const cleanedMetrics = collectSnippetMetrics(cleanedSnippet)
  const decodedMetrics = collectSnippetMetrics(decodedCandidate)

  const cleanedScore = cleanedMetrics.readableRatio - cleanedMetrics.weirdRatio - cleanedMetrics.latin1Ratio * 0.5
  const decodedScore = decodedMetrics.readableRatio - decodedMetrics.weirdRatio - decodedMetrics.latin1Ratio * 0.5

  const cleanedKeywordHit = containsKeyword(cleanedSnippet, keyword)
  const decodedKeywordHit = containsKeyword(decodedCandidate, keyword)

  if (decodedKeywordHit && !cleanedKeywordHit) {
    return decodedCandidate
  }

  if (decodedScore > cleanedScore + 0.08) {
    return decodedCandidate
  }

  return cleanedSnippet
}

function normalizeSearchSnippetText(value = '') {
  const stripped = Array.from(String(value || ''))
    .map((char) => {
      const code = char.charCodeAt(0)
      const isBasicControl = code <= 31 && code !== 9 && code !== 10 && code !== 13
      const isC1Control = code >= 127 && code <= 159
      return isBasicControl || isC1Control ? ' ' : char
    })
    .join('')

  return stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLikelyGarbledSnippet(value = '') {
  const source = String(value || '')
  if (!source) return true

  // C1 控制区字符通常来自二进制/编码错位。
  if (/[\u0080-\u009f]/.test(source)) return true

  const metrics = collectSnippetMetrics(source)
  return (
    metrics.weirdRatio > 0.28
    || metrics.readableRatio < 0.58
    || metrics.tokenRatio < 0.18
    || (metrics.latin1Ratio > 0.12 && metrics.cjkRatio < 0.02)
  )
}

function formatLocatorHint(locator = {}) {
  if (locator?.type === 'pdf' && Number.isFinite(Number(locator.page))) {
    return `第 ${Number(locator.page)} 页`
  }

  if (locator?.type === 'tabular') {
    const sheet = String(locator.sheetName || '').trim()
    const row = Number.isFinite(Number(locator.rowIndex)) ? Number(locator.rowIndex) + 1 : null
    const col = Number.isFinite(Number(locator.colIndex)) ? Number(locator.colIndex) + 1 : null

    if (sheet && row != null && col != null) return `${sheet} / 第 ${row} 行第 ${col} 列`
    if (sheet) return sheet
  }

  if (locator?.type === 'text' && Number.isFinite(Number(locator.startOffset))) {
    return `文本偏移 ${Number(locator.startOffset)}`
  }

  return ''
}

function buildSearchSnippetFallback(keyword = '', locator = {}) {
  const safeKeyword = String(keyword || '').trim()
  const locatorHint = formatLocatorHint(locator)

  if (safeKeyword && locatorHint) {
    return `关键词“${safeKeyword}”命中（${locatorHint}），点击后定位查看上下文`
  }
  if (safeKeyword) {
    return `关键词“${safeKeyword}”命中，点击后定位查看上下文`
  }
  if (locatorHint) {
    return `命中结果已定位（${locatorHint}），点击后查看上下文`
  }
  return '命中结果已定位，点击后查看上下文'
}

function normalizeSearchSnippet(rawSnippet = '', keyword = '', locator = {}) {
  const cleaned = normalizeSearchSnippetText(rawSnippet)
  if (!cleaned) {
    return buildSearchSnippetFallback(keyword, locator)
  }

  const candidate = chooseBestSnippetCandidate(cleaned, keyword)

  if (isLikelyGarbledSnippet(candidate)) {
    return buildSearchSnippetFallback(keyword, locator)
  }

  if (!containsKeyword(candidate, keyword) && isLikelyGarbledSnippet(cleaned)) {
    return buildSearchSnippetFallback(keyword, locator)
  }

  return candidate
}

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

function toLocatorNumberToken(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? String(numeric) : ''
}

export function buildSearchResultKey(result = {}) {
  const docId = String(result.docId || result.documentId || result.document?.id || '')
  const locator = result.locator || {}
  const type = String(locator.type || result.readerKind || '').trim().toLowerCase()
  const keyword = String(result.keyword || result.q || locator.keyword || '').trim().toLowerCase()
  const sheetName = String(locator.sheetName || '').trim().toLowerCase()

  return [
    docId,
    type,
    sheetName,
    toLocatorNumberToken(locator.page),
    toLocatorNumberToken(locator.rowIndex),
    toLocatorNumberToken(locator.colIndex),
    toLocatorNumberToken(locator.blockIndex),
    toLocatorNumberToken(locator.startOffset),
    toLocatorNumberToken(locator.matchIndex),
    keyword,
  ].join('::')
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

  const locator = normalizeLocator(result)
  const keyword = result.keyword || result.q || locatorKeyword(locator)
  const rawSnippet = result.snippet || result.excerpt || result.matchText || ''
  const normalizedSnippet = normalizeSearchSnippet(rawSnippet, keyword, locator)

  const normalizedResult = {
    ...result,
    id: result.id || `${document.id}-${result.page || result.rowIndex || result.blockIndex || 0}-${result.startOffset || 0}`,
    document,
    docId: document.id,
    docName: document.name,
    readerKind: document.readerKind,
    rawSnippet,
    snippet: normalizedSnippet,
    keyword,
    locator,
  }

  return {
    ...normalizedResult,
    resultKey: buildSearchResultKey(normalizedResult),
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
