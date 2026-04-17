/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import {
  buildSearchResultKey,
  createSourceLocator,
  findProjectDocumentByName,
  listProjectDocuments,
  locatorKeyword,
  normalizeDocumentMeta,
  searchProjectDocuments,
} from '../../services/documentService'

const DocumentReaderContext = createContext(null)

const EMPTY_MATCH_STATE = { count: 0, activeIndex: -1 }
const DEFAULT_VIEWPORT_WIDTH = 1600
const DEFAULT_VIEWPORT_HEIGHT = 900
const DEFAULT_SIDEBAR_WIDTH = 280
const DEFAULT_PEEK_TOP = 16
const MIN_DOCK_WIDTH = 520
const MAX_DOCK_WIDTH = 1100
const DOCK_VIEWPORT_GUTTER = 80
const PEEK_HEIGHT_ESTIMATE = 112
const MAX_LOCAL_MATCH_FALLBACK_ITEMS = 20

function getViewportWidth() {
  return typeof window === 'undefined' ? DEFAULT_VIEWPORT_WIDTH : window.innerWidth
}

function getViewportHeight() {
  return typeof window === 'undefined' ? DEFAULT_VIEWPORT_HEIGHT : window.innerHeight
}

function clampDockWidth(width, viewportWidth = getViewportWidth()) {
  const maxWidth = Math.max(MIN_DOCK_WIDTH, Math.min(MAX_DOCK_WIDTH, viewportWidth - DOCK_VIEWPORT_GUTTER))
  const fallbackWidth = Math.round(viewportWidth * 0.48)
  const nextWidth = Number.isFinite(Number(width)) ? Number(width) : fallbackWidth
  return Math.max(MIN_DOCK_WIDTH, Math.min(maxWidth, Math.round(nextWidth)))
}

function clampPeekTop(top, viewportHeight = getViewportHeight()) {
  const maxTop = Math.max(DEFAULT_PEEK_TOP, viewportHeight - PEEK_HEIGHT_ESTIMATE)
  const nextTop = Number.isFinite(Number(top)) ? Number(top) : DEFAULT_PEEK_TOP
  return Math.max(DEFAULT_PEEK_TOP, Math.min(maxTop, Math.round(nextTop)))
}

function readLayout(projectId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`optitree:document-reader-layout:${projectId || 'global'}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLayout(projectId, nextValue) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `optitree:document-reader-layout:${projectId || 'global'}`,
      JSON.stringify(nextValue),
    )
  } catch {
    // Ignore persistence failures and keep the in-memory layout working.
  }
}

function snippetScore(result, normalizedSearchQuery) {
  const snippet = String(result?.snippet || '').toLowerCase()
  if (!snippet || !normalizedSearchQuery) return 0
  if (snippet.startsWith(normalizedSearchQuery)) return 2
  if (snippet.includes(normalizedSearchQuery)) return 1
  return 0
}

function stableSortResults(results, sortFn) {
  return [...results]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const bySort = sortFn(a.item, b.item)
      if (bySort !== 0) return bySort
      return a.index - b.index
    })
    .map(({ item }) => item)
}

function createLocalMatchFallbackItems({ document, keyword, count, snippetOverrides = {} }) {
  const total = Math.max(0, Number(count) || 0)
  const visibleCount = Math.min(total, MAX_LOCAL_MATCH_FALLBACK_ITEMS)
  if (!document?.id || !keyword || visibleCount <= 0) return []

  const locatorType = document?.readerKind === 'tabular'
    ? 'tabular'
    : document?.readerKind === 'text'
      ? 'text'
      : 'pdf'
  return Array.from({ length: visibleCount }, (_, index) => {
    const locator = {
      type: locatorType,
      keyword,
      matchIndex: index,
    }
    const resultKey = buildSearchResultKey({
      docId: String(document.id),
      keyword,
      locator,
    })

    return {
      id: `local-match-${document.id}-${index + 1}`,
      docId: String(document.id),
      docName: String(document.name || ''),
      snippet: snippetOverrides[resultKey] || `当前文档第 ${index + 1} 条命中`,
      keyword,
      locator,
      resultKey,
      source: 'local-viewer',
    }
  })
}

export function DocumentReaderProvider({ projectId, children }) {
  const [documents, setDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [documentsAttemptCount, setDocumentsAttemptCount] = useState(0)
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchAttemptCount, setSearchAttemptCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchRetryToken, setSearchRetryToken] = useState(0)
  const [searchSnippetOverrides, setSearchSnippetOverrides] = useState({})
  const [dockMode, setDockMode] = useState('closed')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dockWidth, setDockWidthState] = useState(() => clampDockWidth(undefined, getViewportWidth()))
  const [peekTop, setPeekTopState] = useState(() => clampPeekTop(undefined, getViewportHeight()))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [sidebarControlSource, setSidebarControlSource] = useState('auto')
  const [shellMetrics, setShellMetrics] = useState({ width: 0, height: 0 })
  const [activeDocument, setActiveDocument] = useState(null)
  const [activeLocator, setActiveLocator] = useState(null)
  const [viewerMatchState, setViewerMatchState] = useState(EMPTY_MATCH_STATE)
  const [navRequest, setNavRequest] = useState(null)
  const [viewportWidth, setViewportWidth] = useState(getViewportWidth)
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight)
  const lastLoadedProjectRef = useRef('')
  const pendingSearchResultKeyRef = useRef('')

  const loadPersistedLayout = useCallback((nextProjectId = projectId) => {
    const persisted = readLayout(nextProjectId)
    setDockWidthState(clampDockWidth(persisted?.dockWidth, viewportWidth))
    setPeekTopState(clampPeekTop(persisted?.peekTop, viewportHeight))
  }, [projectId, viewportHeight, viewportWidth])

  const resetSidebarState = useCallback(() => {
    setSidebarCollapsed(true)
    setSidebarControlSource('auto')
  }, [])

  const ensureDocuments = useCallback(async (options = {}) => {
    const { force = false } = options
    if (!projectId) {
      setDocuments([])
      setDocumentsAttemptCount(0)
      return []
    }

    if (!force && documentsLoading) return documents
    if (!force && lastLoadedProjectRef.current === String(projectId)) return documents

    setDocumentsLoading(true)
    setDocumentsError('')
    setDocumentsAttemptCount(0)
    try {
      const list = await listProjectDocuments(projectId, {
        onAttempt: (attempt) => {
          setDocumentsAttemptCount(attempt)
        },
      })
      setDocuments(list)
      lastLoadedProjectRef.current = String(projectId)
      return list
    } catch (error) {
      lastLoadedProjectRef.current = String(projectId)
      setDocuments([])
      setDocumentsError(error?.message || '项目文档列表加载失败')
      return []
    } finally {
      setDocumentsLoading(false)
    }
  }, [documents, documentsLoading, projectId])

  const retryDocuments = useCallback(() => {
    lastLoadedProjectRef.current = ''
    return ensureDocuments({ force: true })
  }, [ensureDocuments])

  const retrySearch = useCallback(() => {
    setSearchSnippetOverrides({})
    pendingSearchResultKeyRef.current = ''
    setSearchRetryToken((current) => current + 1)
  }, [])

  const resolveSearchSnippet = useCallback((payload = {}) => {
    const snippet = String(payload.snippet || '').replace(/\s+/g, ' ').trim()
    if (!snippet) return

    const documentId = String(payload.docId || activeDocument?.id || '')
    if (!documentId) return

    const keyword = String(payload.keyword || searchQuery || '').trim()
    const locator = payload.locator || activeLocator || {}
    const derivedKey = buildSearchResultKey({
      docId: documentId,
      keyword,
      locator,
    })
    const pendingKey = String(pendingSearchResultKeyRef.current || '')
    const targetKey = String(payload.resultKey || pendingKey || derivedKey || '')
    if (!targetKey) return

    setSearchSnippetOverrides((current) => {
      if (current[targetKey] === snippet) return current
      return {
        ...current,
        [targetKey]: snippet,
      }
    })

    if (pendingKey && pendingKey === targetKey) {
      pendingSearchResultKeyRef.current = ''
    }
  }, [activeDocument?.id, activeLocator, searchQuery])

  const setDockWidth = useCallback((nextWidth) => {
    setDockWidthState(clampDockWidth(nextWidth, viewportWidth))
  }, [viewportWidth])

  const setPeekTop = useCallback((nextTop) => {
    setPeekTopState(clampPeekTop(nextTop, viewportHeight))
  }, [viewportHeight])

  const reportShellMetrics = useCallback(({ width, height } = {}) => {
    const nextWidth = Math.max(0, Math.round(Number(width) || 0))
    const nextHeight = Math.max(0, Math.round(Number(height) || 0))
    setShellMetrics((current) => {
      if (current.width === nextWidth && current.height === nextHeight) return current
      return { width: nextWidth, height: nextHeight }
    })
  }, [])

  const openSidebar = useCallback((source = 'user') => {
    setSidebarCollapsed(false)
    setSidebarControlSource(source)
  }, [])

  const closeSidebar = useCallback((source = 'user') => {
    setSidebarCollapsed(true)
    setSidebarControlSource(source)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarControlSource('user')
    setSidebarCollapsed((current) => !current)
  }, [])

  const openDocument = useCallback(async (documentInput, locator = null, options = {}) => {
    const loadedDocuments = documents.length ? documents : await ensureDocuments()
    let nextDocument = null

    if (typeof documentInput === 'string' || typeof documentInput === 'number') {
      const docId = String(documentInput)
      nextDocument = loadedDocuments.find((item) => item.id === docId) || null
    } else if (documentInput && typeof documentInput === 'object') {
      const normalized = normalizeDocumentMeta(documentInput)
      nextDocument = normalized.id
        ? (loadedDocuments.find((item) => item.id === normalized.id) || normalized)
        : normalized
    }

    if (!nextDocument) {
      message.warning('未找到目标文档')
      return
    }

    const nextFullscreen = Boolean(options.fullscreen)
    const hasSearchQueryOverride = Object.prototype.hasOwnProperty.call(options, 'searchQuery')
    const nextSearchQuery = hasSearchQueryOverride ? String(options.searchQuery || '') : String(searchQuery || '')
    const currentSearchQuery = String(searchQuery || '')
    const isSameDocument = String(nextDocument.id || '') === String(activeDocument?.id || '')
    const shouldResetMatchState = !isSameDocument || (hasSearchQueryOverride && nextSearchQuery.trim() !== currentSearchQuery.trim())

    setActiveDocument(nextDocument)
    setActiveLocator(locator || options.locator || null)
    if (hasSearchQueryOverride) {
      setSearchQuery(nextSearchQuery)
    }
    if (shouldResetMatchState) {
      setViewerMatchState(EMPTY_MATCH_STATE)
    }
    setDockMode('open')
    setIsFullscreen(nextFullscreen)
    if (nextFullscreen) {
      setSidebarControlSource('auto')
    } else if (options.revealSidebar) {
      openSidebar('user')
    } else {
      resetSidebarState()
    }
  }, [activeDocument?.id, documents, ensureDocuments, openSidebar, resetSidebarState, searchQuery])

  const openDocumentCenter = useCallback(async () => {
    const loadedDocuments = documents.length ? documents : await ensureDocuments()
    if (!activeDocument && loadedDocuments.length > 0) {
      setActiveDocument(loadedDocuments[0])
    }
    setDockMode('open')
    setIsFullscreen(false)
    resetSidebarState()
  }, [activeDocument, documents, ensureDocuments, resetSidebarState])

  const openSearchResult = useCallback(async (result) => {
    if (!result) return
    const locator = result.locator || null
    const query = String(result.keyword || locatorKeyword(locator) || searchQuery || '').trim()
    const resultKey = String(result.resultKey || buildSearchResultKey(result) || '')

    if (resultKey) {
      pendingSearchResultKeyRef.current = resultKey
    }

    const nextOptions = { revealSidebar: true }
    if (query) {
      nextOptions.searchQuery = query
    }
    await openDocument(result.document || result.docId, locator, nextOptions)
  }, [openDocument, searchQuery])

  const openSourceReference = useCallback(async ({ fileName, page, excerpt } = {}) => {
    if (!String(fileName || '').trim()) {
      message.warning('当前节点未关联文档')
      return
    }

    const loadedDocuments = documents.length ? documents : await ensureDocuments()
    const matched = findProjectDocumentByName(loadedDocuments, fileName)
    if (!matched) {
      message.warning(`项目中未找到文档：${fileName}`)
      setDockMode('open')
      setIsFullscreen(false)
      setSearchQuery(String(excerpt || fileName))
      openSidebar('user')
      return
    }

    await openDocument(matched, createSourceLocator(matched, { page, excerpt }), {
      searchQuery: String(excerpt || ''),
      revealSidebar: true,
    })
  }, [documents, ensureDocuments, openDocument, openSidebar])

  const close = useCallback(() => {
    setDockMode('peek')
    setIsFullscreen(false)
    setActiveLocator(null)
    setViewerMatchState(EMPTY_MATCH_STATE)
    setNavRequest(null)
    resetSidebarState()
  }, [resetSidebarState])

  const toggleCollapsed = useCallback(() => {
    setIsFullscreen(false)
    setDockMode((current) => {
      if (current === 'closed' || current === 'peek') {
        resetSidebarState()
        return 'open'
      }
      return 'peek'
    })
  }, [resetSidebarState])

  const toggleFullscreen = useCallback(() => {
    setDockMode((current) => (current === 'closed' ? 'open' : current))
    setSidebarControlSource('auto')
    setIsFullscreen((current) => !current)
  }, [])

  const searchInCurrent = useCallback((query, locator = null) => {
    setSearchQuery(String(query || ''))
    if (locator) setActiveLocator(locator)
    setDockMode((current) => (current === 'closed' ? 'open' : current))
    if (String(query || '').trim()) {
      openSidebar('user')
    }
  }, [openSidebar])

  const jumpToNext = useCallback(() => setNavRequest({ id: Date.now(), direction: 'next' }), [])
  const jumpToPrev = useCallback(() => setNavRequest({ id: Date.now(), direction: 'prev' }), [])

  useEffect(() => {
    const handleResize = () => {
      const nextViewportWidth = getViewportWidth()
      const nextViewportHeight = getViewportHeight()
      setViewportWidth(nextViewportWidth)
      setViewportHeight(nextViewportHeight)
      setDockWidthState((current) => clampDockWidth(current, nextViewportWidth))
      setPeekTopState((current) => clampPeekTop(current, nextViewportHeight))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!projectId) {
      setDocuments([])
      setSearchResults([])
      setActiveDocument(null)
      setDocumentsAttemptCount(0)
      setSearchAttemptCount(0)
      setSearchSnippetOverrides({})
      pendingSearchResultKeyRef.current = ''
      return
    }

    if (String(projectId) !== lastLoadedProjectRef.current) {
      setDocuments([])
      setSearchResults([])
      setDocumentsError('')
      setSearchError('')
      setDocumentsAttemptCount(0)
      setSearchAttemptCount(0)
      setSearchQuery('')
      setSearchSnippetOverrides({})
      setActiveDocument(null)
      setActiveLocator(null)
      setViewerMatchState(EMPTY_MATCH_STATE)
      pendingSearchResultKeyRef.current = ''
      setDockMode('closed')
      setIsFullscreen(false)
      resetSidebarState()
      setShellMetrics({ width: 0, height: 0 })
      lastLoadedProjectRef.current = ''
      loadPersistedLayout(projectId)
    }
  }, [loadPersistedLayout, projectId, resetSidebarState])

  useEffect(() => {
    if (!projectId) return
    writeLayout(projectId, { dockWidth, peekTop })
  }, [dockWidth, peekTop, projectId])

  useEffect(() => {
    if (dockMode === 'closed' || !projectId) return
    if (lastLoadedProjectRef.current === String(projectId)) return
    ensureDocuments()
  }, [dockMode, ensureDocuments, projectId])

  useEffect(() => {
    if (sidebarControlSource !== 'auto') return
    if (!isFullscreen) {
      setSidebarCollapsed(true)
      return
    }
    if (!shellMetrics.width || !shellMetrics.height) return
    setSidebarCollapsed(!(shellMetrics.width > shellMetrics.height * 0.75))
  }, [isFullscreen, shellMetrics.height, shellMetrics.width, sidebarControlSource])

  useEffect(() => {
    if (!projectId || !String(searchQuery || '').trim()) {
      setSearchResults([])
      setSearchError('')
      setSearchAttemptCount(0)
      setSearchSnippetOverrides({})
      pendingSearchResultKeyRef.current = ''
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')
      setSearchAttemptCount(0)
      try {
        const results = await searchProjectDocuments(projectId, searchQuery, {
          onAttempt: (attempt) => {
            if (!cancelled) setSearchAttemptCount(attempt)
          },
        })
        if (!cancelled) setSearchResults(results)
      } catch (error) {
        if (!cancelled) {
          setSearchError(error?.message || '项目文档搜索失败')
          setSearchResults([])
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [projectId, searchQuery, searchRetryToken])

  const isDockVisible = dockMode !== 'closed'
  const isDockExpanded = dockMode === 'open' || isFullscreen
  const sidebarWidth = sidebarCollapsed ? 0 : DEFAULT_SIDEBAR_WIDTH
  const controlRightOffset = useMemo(() => {
    if (isFullscreen) return Math.max(viewportWidth - 24, 640)
    if (dockMode === 'open') return dockWidth + 24
    if (dockMode === 'peek') return 20
    return 0
  }, [dockMode, dockWidth, isFullscreen, viewportWidth])

  const normalizedSearchQuery = String(searchQuery || '').trim().toLowerCase()
  const documentNameMatches = useMemo(() => {
    if (!normalizedSearchQuery) return []
    return documents
      .filter((doc) => String(doc.name || '').toLowerCase().includes(normalizedSearchQuery))
      .sort((a, b) => {
        const aName = String(a.name || '').toLowerCase()
        const bName = String(b.name || '').toLowerCase()
        const aExact = aName === normalizedSearchQuery ? 1 : 0
        const bExact = bName === normalizedSearchQuery ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        const aPrefix = aName.startsWith(normalizedSearchQuery) ? 1 : 0
        const bPrefix = bName.startsWith(normalizedSearchQuery) ? 1 : 0
        if (aPrefix !== bPrefix) return bPrefix - aPrefix
        return aName.localeCompare(bName)
      })
  }, [documents, normalizedSearchQuery])

  const groupedSearchResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return {
        currentDocumentMatches: [],
        otherDocumentMatches: [],
      }
    }

    const currentId = String(activeDocument?.id || '')
    const currentDocumentMatches = []
    const otherDocumentMatches = []

    searchResults.forEach((result) => {
      const resultKey = String(result.resultKey || buildSearchResultKey(result) || '')
      const snippetOverride = resultKey ? searchSnippetOverrides[resultKey] : ''
      const nextResult = snippetOverride && snippetOverride !== result.snippet
        ? {
          ...result,
          resultKey,
          snippet: snippetOverride,
          snippetSource: 'viewer',
        }
        : (result.resultKey ? result : { ...result, resultKey })

      const target = String(nextResult.docId || '') === currentId ? currentDocumentMatches : otherDocumentMatches
      target.push(nextResult)
    })

    const sortedCurrentDocumentMatches = stableSortResults(currentDocumentMatches, (a, b) => {
      return snippetScore(b, normalizedSearchQuery) - snippetScore(a, normalizedSearchQuery)
    })

    const sortedOtherDocumentMatches = stableSortResults(otherDocumentMatches, (a, b) => {
      const aName = String(a.docName || '').toLowerCase()
      const bName = String(b.docName || '').toLowerCase()

      const aExact = aName === normalizedSearchQuery ? 1 : 0
      const bExact = bName === normalizedSearchQuery ? 1 : 0
      if (aExact !== bExact) return bExact - aExact

      const aPrefix = aName.startsWith(normalizedSearchQuery) ? 1 : 0
      const bPrefix = bName.startsWith(normalizedSearchQuery) ? 1 : 0
      if (aPrefix !== bPrefix) return bPrefix - aPrefix

      const bySnippet = snippetScore(b, normalizedSearchQuery) - snippetScore(a, normalizedSearchQuery)
      if (bySnippet !== 0) return bySnippet

      return aName.localeCompare(bName)
    })

    return {
      currentDocumentMatches: sortedCurrentDocumentMatches,
      otherDocumentMatches: sortedOtherDocumentMatches,
    }
  }, [activeDocument?.id, normalizedSearchQuery, searchResults, searchSnippetOverrides])

  const localCurrentDocumentFallback = useMemo(() => {
    if (!normalizedSearchQuery || !activeDocument?.id) {
      return {
        enabled: false,
        count: 0,
        items: [],
        truncated: false,
      }
    }

    const backendCurrentCount = groupedSearchResults.currentDocumentMatches.length
    const localMatchCount = Math.max(0, Number(viewerMatchState?.count) || 0)
    const rawKeyword = String(searchQuery || '').trim()

    if (backendCurrentCount > 0 || localMatchCount <= 0) {
      return {
        enabled: false,
        count: 0,
        items: [],
        truncated: false,
      }
    }

    const items = createLocalMatchFallbackItems({
      document: activeDocument,
      keyword: rawKeyword,
      count: localMatchCount,
      snippetOverrides: searchSnippetOverrides,
    })

    return {
      enabled: items.length > 0,
      count: localMatchCount,
      items,
      truncated: localMatchCount > items.length,
    }
  }, [
    activeDocument,
    groupedSearchResults.currentDocumentMatches.length,
    normalizedSearchQuery,
    searchQuery,
    searchSnippetOverrides,
    viewerMatchState?.count,
  ])

  const prioritizedSearchSections = useMemo(() => {
    if (!normalizedSearchQuery) return []

    const docNameItems = documentNameMatches.map((doc) => ({ id: `doc-name-${doc.id}`, doc }))
    const backendCurrentDocumentMatches = groupedSearchResults.currentDocumentMatches || []
    const otherDocumentMatches = groupedSearchResults.otherDocumentMatches || []
    const useLocalCurrentFallback = localCurrentDocumentFallback.enabled
    const currentDocumentMatches = useLocalCurrentFallback
      ? localCurrentDocumentFallback.items
      : backendCurrentDocumentMatches
    const currentDocumentCount = useLocalCurrentFallback
      ? localCurrentDocumentFallback.count
      : backendCurrentDocumentMatches.length
    const currentDocumentHint = useLocalCurrentFallback
      ? `后端片段不可用，已切换为阅读器本地命中${
        localCurrentDocumentFallback.truncated
          ? `（共 ${currentDocumentCount} 条，展示前 ${currentDocumentMatches.length} 条）`
          : `（共 ${currentDocumentCount} 条）`
      }`
      : ''

    return [
      {
        key: 'current-document',
        title: useLocalCurrentFallback ? '当前文档优先（本地匹配）' : '当前文档优先',
        tone: 'green',
        emphasized: true,
        count: currentDocumentCount,
        hint: currentDocumentHint,
        emptyMessage: activeDocument ? '当前文档暂无命中' : '请先打开一个文档',
        items: currentDocumentMatches,
      },
      {
        key: 'document-name',
        title: '文档名匹配',
        tone: 'blue',
        emphasized: false,
        count: docNameItems.length,
        emptyMessage: '无文档名匹配',
        items: docNameItems,
      },
      {
        key: 'other-documents',
        title: '其他文档内容命中',
        tone: 'gold',
        emphasized: false,
        count: otherDocumentMatches.length,
        emptyMessage: '其他文档暂无命中',
        items: otherDocumentMatches,
      },
    ]
  }, [
    activeDocument,
    documentNameMatches,
    groupedSearchResults,
    localCurrentDocumentFallback,
    normalizedSearchQuery,
  ])

  const searchResultTotalCount = useMemo(() => {
    if (!normalizedSearchQuery) return 0
    return prioritizedSearchSections.reduce((total, section) => total + (Number(section.count) || 0), 0)
  }, [normalizedSearchQuery, prioritizedSearchSections])

  const value = useMemo(() => ({
    projectId,
    documents,
    documentsLoading,
    documentsError,
    documentsAttemptCount,
    searchResults,
    searchLoading,
    searchError,
    searchAttemptCount,
    searchQuery,
    documentNameMatches,
    groupedSearchResults,
    prioritizedSearchSections,
    searchResultTotalCount,
    setSearchQuery,
    dockMode,
    isFullscreen,
    isDockVisible,
    isDockExpanded,
    dockWidth,
    setDockWidth,
    peekTop,
    setPeekTop,
    sidebarWidth,
    sidebarCollapsed,
    sidebarControlSource,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    shellMetrics,
    reportShellMetrics,
    controlRightOffset,
    activeDocument,
    activeLocator,
    viewerMatchState,
    navRequest,
    setViewerMatchState,
    openDocument,
    openDocumentCenter,
    openSearchResult,
    resolveSearchSnippet,
    openSourceReference,
    close,
    toggleCollapsed,
    toggleFullscreen,
    searchInCurrent,
    jumpToNext,
    jumpToPrev,
    ensureDocuments,
    retryDocuments,
    retrySearch,
  }), [
    activeDocument,
    activeLocator,
    close,
    closeSidebar,
    controlRightOffset,
    dockMode,
    dockWidth,
    documentNameMatches,
    documents,
    documentsAttemptCount,
    documentsError,
    documentsLoading,
    ensureDocuments,
    groupedSearchResults,
    isDockExpanded,
    isDockVisible,
    isFullscreen,
    jumpToNext,
    jumpToPrev,
    navRequest,
    openDocument,
    openDocumentCenter,
    openSearchResult,
    resolveSearchSnippet,
    openSidebar,
    openSourceReference,
    peekTop,
    prioritizedSearchSections,
    projectId,
    reportShellMetrics,
    retryDocuments,
    retrySearch,
    searchAttemptCount,
    searchError,
    searchInCurrent,
    searchLoading,
    searchQuery,
    searchResultTotalCount,
    searchResults,
    setDockWidth,
    setPeekTop,
    shellMetrics,
    sidebarCollapsed,
    sidebarControlSource,
    sidebarWidth,
    toggleCollapsed,
    toggleFullscreen,
    toggleSidebar,
    viewerMatchState,
  ])

  return (
    <DocumentReaderContext.Provider value={value}>
      {children}
    </DocumentReaderContext.Provider>
  )
}

export function useDocumentReader() {
  const context = useContext(DocumentReaderContext)
  if (!context) {
    throw new Error('useDocumentReader 必须在 DocumentReaderProvider 内使用')
  }
  return context
}
