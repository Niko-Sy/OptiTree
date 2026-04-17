/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import {
  createSourceLocator,
  findProjectDocumentByName,
  listProjectDocuments,
  locatorKeyword,
  normalizeDocumentMeta,
  searchProjectDocuments,
} from '../../services/documentService'

const DocumentReaderContext = createContext(null)

const EMPTY_MATCH_STATE = { count: 0, activeIndex: -1 }

function clampDockWidth(viewportWidth) {
  const width = Math.round(viewportWidth * 0.48)
  return Math.max(520, Math.min(920, width))
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
  const [dockMode, setDockMode] = useState('closed')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeDocument, setActiveDocument] = useState(null)
  const [activeLocator, setActiveLocator] = useState(null)
  const [viewerMatchState, setViewerMatchState] = useState(EMPTY_MATCH_STATE)
  const [navRequest, setNavRequest] = useState(null)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1600 : window.innerWidth))
  const lastLoadedProjectRef = useRef('')

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
    setSearchRetryToken((current) => current + 1)
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

    setActiveDocument(nextDocument)
    setActiveLocator(locator || options.locator || null)
    if (Object.prototype.hasOwnProperty.call(options, 'searchQuery')) {
      setSearchQuery(String(options.searchQuery || ''))
    }
    setViewerMatchState(EMPTY_MATCH_STATE)
    setDockMode('open')
    setIsFullscreen(Boolean(options.fullscreen))
  }, [documents, ensureDocuments])

  const openDocumentCenter = useCallback(async () => {
    const loadedDocuments = documents.length ? documents : await ensureDocuments()
    if (!activeDocument && loadedDocuments.length > 0) {
      setActiveDocument(loadedDocuments[0])
    }
    setDockMode('open')
  }, [activeDocument, documents, ensureDocuments])

  const openSearchResult = useCallback(async (result) => {
    if (!result) return
    const locator = result.locator || null
    const query = result.keyword || locatorKeyword(locator)
    await openDocument(result.document || result.docId, locator, { searchQuery: query })
  }, [openDocument])

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
      setSearchQuery(String(excerpt || fileName))
      return
    }

    await openDocument(matched, createSourceLocator(matched, { page, excerpt }), {
      searchQuery: String(excerpt || ''),
    })
  }, [documents, ensureDocuments, openDocument])

  const close = useCallback(() => {
    setDockMode('peek')
    setIsFullscreen(false)
    setActiveLocator(null)
    setViewerMatchState(EMPTY_MATCH_STATE)
    setNavRequest(null)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setIsFullscreen(false)
    setDockMode((current) => {
      if (current === 'closed') return 'open'
      return current === 'peek' ? 'open' : 'peek'
    })
  }, [])

  const toggleFullscreen = useCallback(() => {
    setDockMode((current) => (current === 'closed' ? 'open' : current))
    setIsFullscreen((current) => !current)
  }, [])

  const searchInCurrent = useCallback((query, locator = null) => {
    setSearchQuery(String(query || ''))
    if (locator) setActiveLocator(locator)
    setDockMode((current) => (current === 'closed' ? 'open' : current))
  }, [])

  const jumpToNext = useCallback(() => setNavRequest({ id: Date.now(), direction: 'next' }), [])
  const jumpToPrev = useCallback(() => setNavRequest({ id: Date.now(), direction: 'prev' }), [])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
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
      setActiveDocument(null)
      setActiveLocator(null)
      setViewerMatchState(EMPTY_MATCH_STATE)
      setDockMode('closed')
      setIsFullscreen(false)
      lastLoadedProjectRef.current = ''
    }
  }, [projectId])

  useEffect(() => {
    if (dockMode === 'closed' || !projectId) return
    if (lastLoadedProjectRef.current === String(projectId)) return
    ensureDocuments()
  }, [dockMode, ensureDocuments, projectId])

  useEffect(() => {
    if (!projectId || !String(searchQuery || '').trim()) {
      setSearchResults([])
      setSearchError('')
      setSearchAttemptCount(0)
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

  const dockWidth = useMemo(() => clampDockWidth(viewportWidth), [viewportWidth])
  const isDockVisible = dockMode !== 'closed'
  const isDockExpanded = dockMode === 'open' || isFullscreen
  const controlRightOffset = useMemo(() => {
    if (isFullscreen) return Math.max(viewportWidth - 24, 640)
    if (dockMode === 'open') return dockWidth + 24
    if (dockMode === 'peek') return 40
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
      const target = String(result.docId || '') === currentId ? currentDocumentMatches : otherDocumentMatches
      target.push(result)
    })

    const snippetScore = (result) => {
      const snippet = String(result.snippet || '').toLowerCase()
      if (!snippet) return 0
      if (snippet.startsWith(normalizedSearchQuery)) return 2
      if (snippet.includes(normalizedSearchQuery)) return 1
      return 0
    }

    otherDocumentMatches.sort((a, b) => {
      const aName = String(a.docName || '').toLowerCase()
      const bName = String(b.docName || '').toLowerCase()

      const aExact = aName === normalizedSearchQuery ? 1 : 0
      const bExact = bName === normalizedSearchQuery ? 1 : 0
      if (aExact !== bExact) return bExact - aExact

      const aPrefix = aName.startsWith(normalizedSearchQuery) ? 1 : 0
      const bPrefix = bName.startsWith(normalizedSearchQuery) ? 1 : 0
      if (aPrefix !== bPrefix) return bPrefix - aPrefix

      const bySnippet = snippetScore(b) - snippetScore(a)
      if (bySnippet !== 0) return bySnippet

      return aName.localeCompare(bName)
    })

    return {
      currentDocumentMatches,
      otherDocumentMatches,
    }
  }, [activeDocument?.id, normalizedSearchQuery, searchResults])

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
    setSearchQuery,
    dockMode,
    isFullscreen,
    isDockVisible,
    isDockExpanded,
    dockWidth,
    controlRightOffset,
    activeDocument,
    activeLocator,
    viewerMatchState,
    navRequest,
    setViewerMatchState,
    openDocument,
    openDocumentCenter,
    openSearchResult,
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
    dockMode,
    isFullscreen,
    isDockVisible,
    isDockExpanded,
    dockWidth,
    controlRightOffset,
    activeDocument,
    activeLocator,
    viewerMatchState,
    navRequest,
    openDocument,
    openDocumentCenter,
    openSearchResult,
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
