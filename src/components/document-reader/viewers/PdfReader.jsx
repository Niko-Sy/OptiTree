import { useEffect, useRef, useState } from 'react'
import { Spin } from 'antd'
import { SpecialZoomLevel, Viewer, Worker } from '@react-pdf-viewer/core'
import { searchPlugin } from '@react-pdf-viewer/search'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'
import { fetchDocumentPreviewBlob } from '../../../services/documentService'
import RequestErrorState from '../RequestErrorState'
import ViewerZoomControls from '../ViewerZoomControls'

const PDF_ZOOM_SCALE_LIST = [0.6, 0.8, 1, 1.25, 1.5, 2]

function resolvePdfZoomLevel(level) {
  const numeric = Number(level)
  if (!Number.isFinite(numeric) || numeric <= 0) return 1
  return Math.max(0.6, Math.min(2, Number(numeric.toFixed(2))))
}

function nextPdfZoomLevel(currentLevel, direction) {
  const normalized = resolvePdfZoomLevel(currentLevel)
  if (direction === 'in') {
    const next = PDF_ZOOM_SCALE_LIST.find((item) => item > normalized + 0.001)
    return next || PDF_ZOOM_SCALE_LIST[PDF_ZOOM_SCALE_LIST.length - 1]
  }
  const reversed = [...PDF_ZOOM_SCALE_LIST].reverse()
  const next = reversed.find((item) => item < normalized - 0.001)
  return next || PDF_ZOOM_SCALE_LIST[0]
}

function buildPdfActiveSnippet(match, fallbackKeyword = '') {
  const keyword = String(fallbackKeyword || '').trim()
  const pageText = typeof match?.pageText === 'string' ? match.pageText : ''
  const hasPageText = Boolean(pageText)

  if (hasPageText && Number.isFinite(Number(match?.startIndex)) && Number.isFinite(Number(match?.endIndex))) {
    const start = Math.max(0, Number(match.startIndex) - 24)
    const end = Math.min(pageText.length, Number(match.endIndex) + 56)
    const snippet = pageText.slice(start, end).replace(/\s+/g, ' ').trim()
    if (snippet) return snippet
  }

  const resolvedMatchText = String(match?.matchedText || match?.matchedKeyword || '').trim()
  if (resolvedMatchText) return resolvedMatchText

  if (keyword) {
    const pageHint = Number.isFinite(Number(match?.pageIndex)) ? `第 ${Number(match.pageIndex) + 1} 页` : '当前页'
    return `${pageHint} 命中：${keyword}`
  }

  return ''
}

function findGlobalIndex(matches, candidate) {
  if (!candidate) return -1
  return matches.findIndex((item) => item.pageIndex === candidate.pageIndex && item.matchIndex === candidate.matchIndex)
}

export default function PdfReader({
  documentMeta,
  searchQuery,
  locator,
  navRequest,
  onMatchStateChange,
  onActiveSnippetChange,
}) {
  const searchPluginInstance = searchPlugin({ enableShortcuts: false })
  const [fileUrl, setFileUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [zoomLevel, setZoomLevel] = useState(1)
  const matchesRef = useRef([])
  const zoomToRef = useRef(null)
  const zoomBridgePluginRef = useRef({
    renderViewer: (renderProps) => {
      zoomToRef.current = renderProps.zoom
      return renderProps.slot
    },
  })

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function loadFile() {
      setLoading(true)
      setError('')
      setAttempts(0)
      setActiveIndex(-1)
      setZoomLevel(1)
      matchesRef.current = []
      onMatchStateChange?.({ count: 0, activeIndex: -1 })

      try {
        const blob = await fetchDocumentPreviewBlob(documentMeta, {
          onAttempt: (attempt) => {
            if (!cancelled) setAttempts(attempt)
          },
        })
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setFileUrl(objectUrl)
      } catch (err) {
        if (!cancelled) {
          const msg = err?.message || 'PDF 预览加载失败'
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFile()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [documentMeta, onMatchStateChange])

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      if (!fileUrl) return
      const keyword = String(searchQuery || '').trim()
      if (!keyword) {
        searchPluginInstance.clearHighlights()
        matchesRef.current = []
        setActiveIndex(-1)
        onMatchStateChange?.({ count: 0, activeIndex: -1 })
        return
      }

      const matches = await searchPluginInstance.highlight(keyword)
      if (cancelled) return

      matchesRef.current = matches
      if (!matches.length) {
        setActiveIndex(-1)
        onMatchStateChange?.({ count: 0, activeIndex: -1 })
        return
      }

      let nextIndex = 0
      if (Number.isFinite(locator?.matchIndex)) {
        nextIndex = Math.max(0, Math.min(matches.length - 1, locator.matchIndex))
      } else if (Number.isFinite(locator?.page)) {
        const matchedIndex = matches.findIndex((item) => item.pageIndex === Number(locator.page) - 1)
        nextIndex = matchedIndex >= 0 ? matchedIndex : 0
      }

      searchPluginInstance.jumpToMatch(nextIndex + 1)
      setActiveIndex(nextIndex)
      onMatchStateChange?.({ count: matches.length, activeIndex: nextIndex })
    }

    runSearch().catch((err) => {
      const msg = err?.message || 'PDF 搜索失败'
      setError(msg)
    })

    return () => {
      cancelled = true
    }
  // searchPluginInstance 每次渲染都会返回新对象，不能作为依赖，否则会触发循环更新。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, locator?.matchIndex, locator?.page, onMatchStateChange, searchQuery])

  useEffect(() => {
    if (!navRequest || !matchesRef.current.length) return

    const nextActiveIndex = navRequest.direction === 'prev'
      ? (activeIndex <= 0 ? matchesRef.current.length - 1 : activeIndex - 1)
      : (activeIndex >= matchesRef.current.length - 1 ? 0 : activeIndex + 1)

    const candidate = navRequest.direction === 'prev'
      ? searchPluginInstance.jumpToPreviousMatch()
      : searchPluginInstance.jumpToNextMatch()

    const resolvedIndex = findGlobalIndex(matchesRef.current, candidate)
    const targetIndex = resolvedIndex >= 0 ? resolvedIndex : nextActiveIndex
    setActiveIndex(targetIndex)
    onMatchStateChange?.({ count: matchesRef.current.length, activeIndex: targetIndex })
  // searchPluginInstance 每次渲染都会返回新对象，不能作为依赖，否则会触发循环更新。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, navRequest, onMatchStateChange])

  useEffect(() => {
    if (activeIndex < 0 || !matchesRef.current.length) return
    const match = matchesRef.current[activeIndex]
    if (!match) return

    const snippet = buildPdfActiveSnippet(match, searchQuery)
    onActiveSnippetChange?.({
      docId: documentMeta?.id,
      keyword: searchQuery,
      locator: {
        type: 'pdf',
        keyword: searchQuery,
        page: Number.isFinite(Number(match.pageIndex)) ? Number(match.pageIndex) + 1 : locator?.page,
        matchIndex: Number.isFinite(Number(match.matchIndex)) ? Number(match.matchIndex) : activeIndex,
      },
      snippet,
    })
  }, [activeIndex, documentMeta?.id, locator?.page, onActiveSnippetChange, searchQuery])

  function applyZoomChange(direction) {
    const next = nextPdfZoomLevel(zoomLevel, direction)
    setZoomLevel(next)
    zoomToRef.current?.(next)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin description="正在加载 PDF..." />
      </div>
    )
  }

  if (error) {
    return (
      <RequestErrorState
        title="PDF 预览加载失败"
        message={error}
        attempts={attempts}
      />
    )
  }

  if (!fileUrl) return null

  return (
    <div className="relative h-full min-h-0 bg-[#f7f8fb] p-4">
      <ViewerZoomControls
        zoomLevel={zoomLevel}
        onZoomChange={(updater) => {
          if (typeof updater === 'function') {
            const simulated = updater(zoomLevel)
            const direction = simulated > zoomLevel ? 'in' : 'out'
            applyZoomChange(direction)
            return
          }
          const target = resolvePdfZoomLevel(updater)
          const direction = target > zoomLevel ? 'in' : 'out'
          applyZoomChange(direction)
        }}
      />

      <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Worker workerUrl={workerUrl}>
          <Viewer
            key={`${documentMeta.id}-${locator?.page || 0}`}
            fileUrl={fileUrl}
            plugins={[searchPluginInstance, zoomBridgePluginRef.current]}
            defaultScale={SpecialZoomLevel.PageFit}
            initialPage={Number.isFinite(locator?.page) ? Math.max(0, Number(locator.page) - 1) : 0}
            onZoom={(event) => {
              setZoomLevel(resolvePdfZoomLevel(event.scale))
            }}
            renderLoader={(percentages) => (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                正在渲染 PDF... {Math.round(percentages)}%
              </div>
            )}
          />
        </Worker>
      </div>
    </div>
  )
}
